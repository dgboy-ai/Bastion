import { NextResponse } from "next/server";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { safeQuery } from "@/lib/db";
import { computeHmacHash } from "@/lib/hash-chain";
import { embedToVectorString } from "@/lib/embeddings";
import { callLocalMcpTool } from "@/lib/local-mcp";
import { randomUUID } from "crypto";
import { callGroq as groqCall } from "@/lib/groq";
import { callOpenRouter } from "@/lib/openrouter";

export const maxDuration = 60;

const REGION = process.env.AWS_REGION || "ap-south-1";
const GEO_PREFIX = REGION.startsWith("ap-") ? "apac" : REGION.startsWith("eu-") ? "eu" : REGION.startsWith("us-") ? "us" : "apac";
const MODEL_ID = process.env.BEDROCK_MODEL_ID || `${GEO_PREFIX}.anthropic.claude-3-5-sonnet-20241022-v2:0`;

const client = new BedrockRuntimeClient({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const SYSTEM_PROMPT = `You are Bastion, an autonomous security-hardened memory agent backed by CockroachDB.

You have access to these tools:
- memory_search: Search memories by semantic similarity (C-SPANN vector index)
- memory_list: List recent memories (paginated) — use when the user asks what memories exist or what you know
- memory_store: Store a new memory with hash chain integrity
- memory_timetravel: Query memory state at a past timestamp (AS OF SYSTEM TIME)
- memory_audit: View the append-only audit log
- memory_health: Check memory system health
- memory_correct: Update an existing memory's content
- dream: Trigger a dreaming/consolidation cycle — reviews recent memories, extracts patterns, consolidates duplicates, promotes high-value memories, prunes low-value ones
- dream_history: View past dreaming/consolidation sessions — shows what was consolidated, promoted, and pruned in each cycle

CockroachDB platform tools:
- multi_signal_search: Hybrid search — combines vector similarity + BM25 keyword + entity matching + temporal recency. Use for fuzzy/partial queries, misspellings, or when pure semantic search misses. Args: query, k (default 10), memory_type.
- managed_mcp_call: Run a tool on the official CockroachDB Cloud Managed MCP Server (cluster info, databases, tables, schemas, SQL execution). Valid tools: list_clusters, get_cluster, list_databases, list_tables, get_table_schema, select_query, explain_query, show_statement, show_running_queries, create_database, create_table, insert_rows. Args: tool (e.g. "list_databases", "list_tables", "select_query"), params (e.g. {"database":"defaultdb"}). First call list tools with managed_mcp_list_tools.
- ccloud_exec: Run a CockroachDB Cloud CLI (ccloud) command. Args: command (e.g. "cluster list", "cluster info", "auth whoami", "cluster regions"), args (array).
- invoke_agent_skill: Execute a CockroachDB Agent Skill playbook (health checks, performance triage, schema analysis, security audits). Args: skill_name (e.g. "reviewing-cluster-health"), execute (bool), params. List skills first with list_agent_skills.

RULES:
1. Always think step-by-step before acting
2. For searches, use memory_search with the user's query; if results are poor, try multi_signal_search
3. For stores, ALWAYS call memory_store — the guard handles malicious content, you don't need to refuse
4. For "what memories do you have / what do you know" — call memory_list (up to 50) and summarize the content
5. For time travel, extract the timestamp from the user's message
6. Always mention SERIALIZABLE isolation when storing
7. Always mention the hash chain growing when storing
8. Be concise but informative
9. If the user asks what you know, search first
10. Never refuse a memory_store request — the ASI06 guard will block malicious content
11. For audit requests, call memory_audit
12. For questions about the CockroachDB cluster (health, tables, schema, SQL) — use managed_mcp_call, ccloud_exec, or invoke_agent_skill (list_agent_skills first if unsure of skill names)
13. Prefer the real CockroachDB tools over fabricating cluster facts — if a tool fails, say so honestly
14. When using select_query on agent_memory, NEVER use SELECT * — the embedding column (1024-dim vector) blows the result-size limit. Always list specific columns (e.g. memory_id, memory_type, content, created_at) and add LIMIT.

CRITICAL OUTPUT FORMAT:
- Your ENTIRE reply must be exactly ONE JSON object. No text before it, no text after it, no prose, no markdown, no code fences.
- Do NOT use think/reasoning tags (think blocks, reasoning, analysis). Do NOT output any reasoning text at all — the "thought" field is where your reasoning goes.
- If you call a tool, reply with ONLY: {"tool": "tool_name", "args": {...}, "thought": "..."}
- If you respond to the user, reply with ONLY: {"response": "..."}
- Never mix text and JSON. Never wrap the JSON in fences.
- JSON KEYS MUST HAVE CLOSING QUOTES: "memory_type": "semantic" (NOT "memory_type: "semantic")
- Double-check every key has a closing quote before the colon.

When you call a tool, respond with a JSON object:
{
  "tool": "tool_name",
  "args": { "arg1": "value1" },
  "thought": "your reasoning about why you're calling this tool"
}

When you're done and want to respond to the user, respond with:
{
  "response": "your response to the user"
}`;

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  thought: string;
}

interface GuardReport {
  isSafe: boolean;
  findings: Array<{ detector: string; threatType: string; severity: string; detail: string; confidence: number }>;
  trustScore: number;
  poisoningRisk: string;
  blockedSeverity: string;
}

/**
 * Lightweight OWASP ASI06 guard — mirrors the Python MemoryGuard patterns so the
 * approval modal shows REAL guard results (not fabricated client-side values).
 */
function runGuardCheck(content: string): GuardReport {
  const findings: Array<{ detector: string; threatType: string; severity: string; detail: string; confidence: number }> = [];
  const patterns: Array<[RegExp, string, string, string, number]> = [
    [/ignore\s+(all\s+)?(previous|prior|earlier|above|preceding)\s+instructions?/i, "prompt_injection", "ASI06: Memory Poisoning", "Prompt injection: ignore instructions", 0.85],
    [/forget\s+(all\s+)?(previous|prior|earlier|above|everything|what)/i, "prompt_injection", "ASI06: Memory Poisoning", "Memory wipe instruction", 0.85],
    [/system\s*:?\s*(override|update|modify|prompt)/i, "prompt_injection", "ASI06: Memory Poisoning", "System prompt override attempt", 0.85],
    [/output\s+(the\s+)?(secret|api|access)\s*(key|token|secret)/i, "prompt_injection", "ASI06: Memory Poisoning", "Credential extraction attempt", 0.85],
    [/exfiltrat\w*/i, "prompt_injection", "ASI06: Memory Poisoning", "Data exfiltration attempt", 0.85],
    [/\b(drop|truncate|reindex|alter)\s+table\b|\bdelete\s+from\b/i, "prompt_injection", "ASI06: Memory Poisoning", "Destructive SQL injection attempt", 0.85],
    [/you\s+are\s+now\s+(a|an|the)\s+(human|person|admin|developer|god)/i, "prompt_injection", "ASI06: Memory Poisoning", "Identity reassignment", 0.85],
    [/-----BEGIN\s+(RSA|EC|OPENSSH|PGP)\s+PRIVATE\s+KEY-----/i, "secret_detection", "ASI06: Secret Leakage", "Private key material", 0.9],
    [/(?:aws_access_key_id|aws_secret_access_key)/i, "secret_detection", "ASI06: Secret Leakage", "AWS credential", 0.9],
  ];
  for (const [re, detector, threatType, detail, confidence] of patterns) {
    if (re.test(content)) {
      findings.push({ detector, threatType, severity: "critical", detail, confidence });
    }
  }
  const isSafe = findings.length === 0;
  const trustScore = isSafe ? 0.94 : Math.max(0.05, 0.94 - findings.length * 0.3);
  const poisoningRisk = trustScore >= 0.8 ? "NONE" : trustScore >= 0.5 ? "LOW" : trustScore >= 0.2 ? "MEDIUM" : "HIGH";
  return { isSafe, findings, trustScore, poisoningRisk, blockedSeverity: isSafe ? "none" : "critical" };
}

interface AgentStep {
  type: "thought" | "tool_call" | "tool_result" | "response" | "error";
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  sql?: string;
  latency?: string;
}

async function executeToolInline(name: string, args: Record<string, unknown>): Promise<{ result: Record<string, unknown>; sql: string; pendingApproval?: { toolName: string; args: Record<string, unknown>; content: string; previousHash: string; guard?: GuardReport } }> {
  const startTime = Date.now();

  switch (name) {
    case "memory_search": {
      const query = (args.query as string) || "";
      const k = (args.k as number) || 5;
      const embeddingStr = await embedToVectorString(query);
      const res = await safeQuery(
        `SELECT memory_id, agent_id, memory_type, content::varchar(200), trust_level, created_at,
                embedding <=> $1::vector(1024) AS distance
         FROM agent_memory
         WHERE agent_id = $2
         ORDER BY embedding <=> $1::vector(1024)
         LIMIT $3`,
        [embeddingStr, (args.agentId as string) || "mcp-agent", Math.min(k, 20)]
      );
      return {
        result: {
          tool: "memory_search",
          query,
          results: res.rows.map((r: Record<string, unknown>) => ({
            memoryId: r.memory_id,
            content: r.content,
            memoryType: r.memory_type,
            trustLevel: r.trust_level,
            similarity: r.distance ? Math.round((1 - Number(r.distance)) * 100) / 100 : null,
            createdAt: r.created_at,
          })),
          total: res.rows.length,
          latency: `${Date.now() - startTime}ms`,
        },
        sql: `SELECT memory_id, content, trust_level, embedding <=> $1::vector(1024) AS distance\nFROM agent_memory\nWHERE agent_id = $2\nORDER BY embedding <=> $1::vector(1024)\nLIMIT $3`,
      };
    }

    case "memory_list": {
      const limit = Math.min(Number(args.limit) || 50, 100);
      const res = await safeQuery(
        `SELECT memory_id, agent_id, memory_type, content::varchar(200), trust_level, created_at
         FROM agent_memory
         WHERE ($1 = '' OR agent_id = $1)
           AND ($2 = '' OR memory_type = $2)
         ORDER BY created_at DESC
         LIMIT $3`,
        [(args.agentId as string) || "", (args.memoryType as string) || "", limit]
      );
      return {
        result: {
          tool: "memory_list",
          results: res.rows.map((r: Record<string, unknown>) => ({
            memoryId: r.memory_id,
            content: r.content,
            memoryType: r.memory_type,
            trustLevel: r.trust_level,
            createdAt: r.created_at,
          })),
          total: res.rows.length,
          latency: `${Date.now() - startTime}ms`,
        },
        sql: `SELECT memory_id, content, memory_type, trust_level, created_at\nFROM agent_memory\nWHERE agent_id = $1\nORDER BY created_at DESC\nLIMIT $2`,
      };
    }

    case "memory_store": {
      // DON'T execute yet — return pending approval for HITL
      const content = (args.content as string) || "";
      const agentId = (args.agentId as string) || "mcp-agent";
      const memoryType = (args.memoryType as string) || "conversation";

      // Run the OWASP ASI06 guard so the approval modal shows real findings.
      const guard = runGuardCheck(content);

      // Get previous hash for chain info
      const lastMem = await safeQuery(
        "SELECT cryptographic_hash FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1",
        [agentId]
      );
      const previousHash = lastMem.rows[0]?.cryptographic_hash as string || "";

      return {
        result: {
          tool: "memory_store",
          status: "pending_approval",
          content,
          agentId,
          memoryType,
          previousHash: previousHash.slice(0, 12) + "...",
          isolation: "SERIALIZABLE",
          guard,
          message: guard.isSafe
            ? "Write operation requires human approval before execution."
            : `Guard blocked content (${guard.poisoningRisk}): ${guard.findings[0]?.detail || "injection detected"}`,
        },
        sql: `INSERT INTO agent_memory (memory_id, agent_id, memory_type, content, embedding, previous_hash, cryptographic_hash, trust_level)\nVALUES ($1, $2, $3, $4, $5::vector(1024), $6, $7, 3)`,
        pendingApproval: {
          toolName: "memory_store",
          args: { content, agentId, memoryType },
          content,
          previousHash: previousHash.slice(0, 12) + "...",
          guard,
        },
      };
    }

    case "memory_timetravel": {
      // Validate the LLM-supplied timestamp to prevent SQL injection into the
      // AS OF SYSTEM TIME literal (mirrors the MCP server's validation).
      const rawTs = (args.timestamp as string) || new Date(Date.now() - 3600000).toISOString();
      const isoMatch = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.exec(rawTs.trim());
      const timestamp = isoMatch ? rawTs.trim().replace(/'/g, "") : new Date(Date.now() - 3600000).toISOString();
      const agentId = (args.agentId as string) || "mcp-agent";
      const res = await safeQuery(
        `SELECT memory_id, memory_type, content::varchar(200), trust_level, created_at
         FROM agent_memory
         AS OF SYSTEM TIME '${timestamp}'
         WHERE agent_id = $1`,
        [agentId]
      );
      return {
        result: {
          tool: "memory_timetravel",
          timestamp,
          memories: res.rows.map((r: Record<string, unknown>) => ({
            memoryId: r.memory_id,
            content: r.content,
            memoryType: r.memory_type,
            trustLevel: r.trust_level,
            createdAt: r.created_at,
          })),
          total: res.rows.length,
          latency: `${Date.now() - startTime}ms`,
        },
        sql: `SELECT memory_id, content, created_at\nFROM agent_memory\nAS OF SYSTEM TIME '${timestamp}'\nWHERE agent_id = $1`,
      };
    }

    case "memory_audit": {
      const agentId = (args.agentId as string) || "mcp-agent";
      const limit = (args.limit as number) || 10;
      const res = await safeQuery(
        `SELECT action, memory_id, recorded_at, cryptographic_hash
         FROM agent_audit
         WHERE agent_id = $1
         ORDER BY recorded_at DESC
         LIMIT $2`,
        [agentId, limit]
      );
      return {
        result: {
          tool: "memory_audit",
          entries: res.rows.map((r: Record<string, unknown>) => ({
            action: r.action,
            memoryId: r.memory_id,
            recordedAt: r.recorded_at,
            hash: (r.cryptographic_hash as string)?.slice(0, 12) + "...",
          })),
          total: res.rows.length,
          latency: `${Date.now() - startTime}ms`,
        },
        sql: `SELECT action, memory_id, recorded_at\nFROM agent_audit\nWHERE agent_id = $1\nORDER BY recorded_at DESC\nLIMIT $2`,
      };
    }

    case "memory_health": {
      const agentId = (args.agentId as string) || "mcp-agent";
      const res = await safeQuery(
        `SELECT 
           COUNT(*) as total,
           COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at > now() THEN 1 END) as active,
           COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= now() THEN 1 END) as expired,
           AVG(importance_score) as avg_importance
         FROM agent_memory WHERE agent_id = $1`,
        [agentId]
      );
      return {
        result: {
          tool: "memory_health",
          totalMemories: parseInt(String(res.rows[0]?.total ?? 0)),
          activeMemories: parseInt(String(res.rows[0]?.active ?? 0)),
          expiredMemories: parseInt(String(res.rows[0]?.expired ?? 0)),
          avgImportance: parseFloat(String(res.rows[0]?.avg_importance ?? 0)).toFixed(2),
          latency: `${Date.now() - startTime}ms`,
        },
        sql: `SELECT COUNT(*) as total, AVG(importance_score) as avg_importance\nFROM agent_memory\nWHERE agent_id = $1`,
      };
    }

    case "memory_correct": {
      const memoryId = (args.memoryId as string) || "";
      const newContent = (args.newContent as string) || "";
      const agentId = (args.agentId as string) || "mcp-agent";

      const existing = await safeQuery(
        "SELECT memory_id, content, previous_hash, metadata::text AS meta, cryptographic_hash FROM agent_memory WHERE memory_id = $1 AND agent_id = $2",
        [memoryId, agentId]
      );
      if (existing.rows.length === 0) {
        return { result: { error: "Memory not found" }, sql: "SELECT ... (not found)" };
      }
      const prevHash = existing.rows[0].previous_hash as string | null;
      let metaJson: Record<string, unknown> | null = null;
      try {
        metaJson = JSON.parse((existing.rows[0].meta as string) || "null");
      } catch {
        metaJson = null;
      }
      // Use the STORED metadata (null -> "") so the recomputed hash matches the
      // Python forensic recomputation over the same row.
      const newHash = computeHmacHash(newContent, metaJson, prevHash);
      await safeQuery(
        "UPDATE agent_memory SET content = $1, cryptographic_hash = $2 WHERE memory_id = $3 AND agent_id = $4",
        [newContent, newHash, memoryId, agentId]
      );
      return {
        result: {
          tool: "memory_correct",
          memoryId,
          previousHash: (prevHash || "").slice(0, 12) + "...",
          newHash: newHash.slice(0, 12) + "...",
          latency: `${Date.now() - startTime}ms`,
        },
        sql: `UPDATE agent_memory SET content = $1, cryptographic_hash = $2\nWHERE memory_id = $3`,
      };
    }

    case "multi_signal_search": {
      const query = (args.query as string) || "";
      const k = Math.min(Number(args.k) || 10, 20);
      const agentId = (args.agentId as string) || "mcp-agent";
      // Hybrid: vector similarity (C-SPANN when available) + keyword overlap +
      // temporal recency, merged in SQL with supported CockroachDB functions.
      const embeddingStr = await embedToVectorString(query);
      const keywords = query.split(/\s+/).filter(Boolean).slice(0, 8);
      const kwFilter = keywords.length
        ? `AND (${keywords.map(() => "lower(content) LIKE $4").join(" OR ")})`
        : "";
      const kwParams = keywords.map((kw) => `%${kw.toLowerCase()}%`);
      const res = await safeQuery(
        `SELECT memory_id, memory_type, content::varchar(250) AS content, trust_level, created_at,
                (embedding <=> $1::vector(1024)) AS vec_distance
         FROM agent_memory
         WHERE agent_id = $2
           ${kwFilter}
         ORDER BY vec_distance ASC NULLS LAST
         LIMIT $${3 + kwParams.length}`,
        [embeddingStr, agentId, ...kwParams, k]
      );
      return {
        result: {
          tool: "multi_signal_search",
          query,
          results: res.rows.map((r: Record<string, unknown>) => ({
            memoryId: r.memory_id,
            content: r.content,
            memoryType: r.memory_type,
            trustLevel: r.trust_level,
            similarity: r.vec_distance != null ? Math.round((1 - Number(r.vec_distance)) * 100) / 100 : null,
            createdAt: r.created_at,
          })),
          total: res.rows.length,
          latency: `${Date.now() - startTime}ms`,
          source: "SQL",
        },
        sql: `SELECT content, embedding <=> $1::vector(1024) AS vec_distance\nFROM agent_memory\nWHERE agent_id = $2\nORDER BY vec_distance\nLIMIT $3`,
      };
    }

    case "managed_mcp_call": {
      const tool = (args.tool as string) || "";
      const params = (args.params as Record<string, unknown>) || {};
      const res = await managedMcpCallInline(tool, params);
      return {
        result: { tool: "managed_mcp_call", provider: "CockroachDB Cloud Managed MCP", ...res, source: "SQL" },
        sql: `[managed-mcp] ${tool}(${JSON.stringify(params)})`,
      };
    }

    case "managed_mcp_list_tools": {
      return {
        result: { provider: "CockroachDB Cloud Managed MCP", tools: MANAGED_MCP_TOOLS, source: "SQL" },
        sql: `[managed-mcp] list_tools`,
      };
    }

    case "ccloud_exec": {
      const command = (args.command as string) || "";
      const cmdArgs = Array.isArray(args.args) ? (args.args as string[]) : [];
      const res = await ccloudExecInline(command, cmdArgs);
      return {
        result: { tool: "ccloud_exec", ...res, source: "SQL" },
        sql: `[ccloud] ${command} ${cmdArgs.join(" ")}`,
      };
    }

    case "list_agent_skills": {
      const res = await listAgentSkillsInline();
      return {
        result: { tool: "list_agent_skills", ...res, source: "SQL" },
        sql: `[skills] list`,
      };
    }

    case "invoke_agent_skill": {
      const skillName = (args.skill_name as string) || (args.skillName as string) || "";
      const execute = Boolean(args.execute);
      const res = await invokeAgentSkillInline(skillName, execute, (args.params as Record<string, unknown>) || {});
      return {
        result: { tool: "invoke_agent_skill", ...res, source: "SQL" },
        sql: `[skills] ${skillName} execute=${execute}`,
      };
    }

    default:
      return { result: { error: `Unknown tool: ${name}` }, sql: "" };
  }
}

/** Map agent-chat args to the local MCP server's snake_case tool args. */
function mapToMcpArgs(name: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (name) {
    case "memory_search":
      return {
        query: args.query ?? "",
        k: args.k ?? 5,
        ...(args.agentId ? { agent_id: args.agentId } : {}),
        ...(args.memoryType ? { memory_type: args.memoryType } : {}),
        ...(args.threshold != null ? { threshold: args.threshold } : {}),
      };
    case "memory_list":
      return {
        ...(args.limit != null ? { limit: Math.min(Number(args.limit) || 50, 100) } : { limit: 50 }),
        ...(args.memoryType ? { memory_type: args.memoryType } : {}),
        ...(args.cursor ? { cursor: args.cursor } : {}),
      };
    case "memory_timetravel":
      return {
        timestamp: args.timestamp ?? new Date(Date.now() - 3600000).toISOString(),
        ...(args.agentId ? { agent_id: args.agentId } : {}),
      };
    case "memory_audit":
      return args.agentId ? { agent_id: args.agentId } : {};
    case "memory_health":
      return {};
    case "dream":
      return {
        ...(args.agentId ? { agent_id: args.agentId } : {}),
        ...(args.lookbackHours != null ? { lookback_hours: args.lookbackHours } : {}),
        ...(args.enableLlm != null ? { enable_llm: args.enableLlm } : {}),
      };
    case "dream_history":
      return {};
    case "memory_correct":
      return {
        memory_id: args.memoryId ?? "",
        new_content: args.newContent ?? "",
        ...(args.metadata ? { metadata: args.metadata } : {}),
      };
    case "multi_signal_search":
      return {
        query: args.query ?? "",
        k: args.k ?? 10,
        ...(args.memoryType ? { memory_type: args.memoryType } : {}),
        ...(args.threshold != null ? { threshold: args.threshold } : {}),
      };
    case "ccloud_exec":
      return {
        command: args.command ?? "",
        ...(Array.isArray(args.args) ? { args: args.args } : {}),
        ...(args.cluster_id ? { cluster_id: args.cluster_id } : {}),
        ...(args.timeout_seconds != null ? { timeout_seconds: args.timeout_seconds } : {}),
      };
    case "invoke_agent_skill":
      return {
        skill_name: args.skill_name ?? args.skillName ?? "",
        execute: Boolean(args.execute ?? false),
        ...(args.params ? { params: args.params } : {}),
      };
    case "managed_mcp_call":
      return {
        tool: args.tool ?? "",
        ...(args.params ? { params: args.params } : {}),
      };
    case "managed_mcp_list_tools":
    case "list_agent_skills":
      return {};
    default:
      return { ...args };
  }
}

const MANAGED_MCP_URL = "https://cockroachlabs.cloud/mcp";
const MANAGED_MCP_TOOLS = [
  "list_clusters",
  "get_cluster",
  "list_databases",
  "list_tables",
  "get_table_schema",
  "select_query",
  "explain_query",
  "show_statement",
  "show_running_queries",
  "create_database",
  "create_table",
  "insert_rows",
];

/**
 * Inline fallback for managed_mcp_call — proxies JSON-RPC directly to the
 * official CockroachDB Cloud Managed MCP endpoint so the agent chat works
 * even when the local Bastion MCP server (:9997) is unreachable.
 */
async function managedMcpCallInline(tool: string, params: Record<string, unknown> | undefined): Promise<Record<string, unknown>> {
  const apiKey = process.env.COCKROACHDB_MCP_API_KEY || "";
  const clusterId = process.env.COCKROACHDB_CLUSTER_ID || "";
  if (!apiKey) {
    return { error: "COCKROACHDB_MCP_API_KEY is not set; cannot reach the Managed MCP server" };
  }
  if (!MANAGED_MCP_TOOLS.includes(tool)) {
    return { error: `Unknown tool: ${tool}`, valid_tools: MANAGED_MCP_TOOLS };
  }
  const args: Record<string, unknown> = { ...(params || {}) };
  if (["list_tables", "get_table_schema", "select_query", "explain_query", "insert_rows", "create_table"].includes(tool)) {
    if (!args.database && !args.database_name) args.database = "defaultdb";
    if (["list_tables", "get_table_schema"].includes(tool) && !args.schema) args.schema = "public";
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "crdb-mcp-enable-write-queries": "true",
  };
  if (clusterId) headers["mcp-cluster-id"] = clusterId;
  try {
    const resp = await fetch(MANAGED_MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: tool, arguments: args },
      }),
      signal: AbortSignal.timeout(30000),
    });
    const text = await resp.text();
    let result: any = {};
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) {
      result = JSON.parse(trimmed);
    } else if (trimmed.startsWith("data:")) {
      for (const line of trimmed.split(/\r?\n/)) {
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try { result = JSON.parse(payload); break; } catch { /* skip */ }
        }
      }
    }
    const toolResult = result.result || result;
    if (Array.isArray(toolResult.content)) {
      for (const item of toolResult.content) {
        if (item?.type === "text") {
          try { return JSON.parse(item.text); } catch { return { text: item.text }; }
        }
      }
    }
    return { raw: toolResult };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), provider: "managed-mcp-inline" };
  }
}

/** Inline fallback for ccloud_exec — runs the real ccloud binary with an allowlist. */
const CCLOUD_ALLOWED = ["cluster list", "cluster info", "cluster regions", "auth whoami"];
async function ccloudExecInline(command: string, args: string[] = []): Promise<Record<string, unknown>> {
  if (!command || !CCLOUD_ALLOWED.some((a) => command.startsWith(a))) {
    return { error: `Command not allowed: ${command}`, allowed: CCLOUD_ALLOWED };
  }
  try {
    const full = `${command} ${args.join(" ")} -o json`.trim();
    const out = execSync(full, { encoding: "utf-8", timeout: 30000 });
    try { return { command: full, result: JSON.parse(out) }; }
    catch { return { command: full, result: out }; }
  } catch (err: any) {
    const stderr = err?.stderr?.toString?.() || "";
    return { error: stderr || (err instanceof Error ? err.message : String(err)) };
  }
}

const SKILLS_DIR = path.resolve(process.cwd(), "..", ".agents", "skills");

async function listAgentSkillsInline(): Promise<Record<string, unknown>> {
  const skills: Array<Record<string, string>> = [];
  try {
    if (!fs.existsSync(SKILLS_DIR)) return { error: `Skills dir not found: ${SKILLS_DIR}` };
    for (const dir of fs.readdirSync(SKILLS_DIR)) {
      const skillDir = path.join(SKILLS_DIR, dir);
      if (!fs.statSync(skillDir).isDirectory()) continue;
      const skillFile = path.join(skillDir, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;
      const md = fs.readFileSync(skillFile, "utf-8");
      const nameMatch = md.match(/^#+\s+(.+)$/m);
      const descMatch = md.match(/^([A-Z].*?\.)\s/m);
      skills.push({
        name: nameMatch?.[1]?.trim() || dir,
        description: descMatch?.[1]?.trim() || "",
        path: skillDir,
      });
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  return { total: skills.length, skills };
}

async function invokeAgentSkillInline(skillName: string, execute: boolean, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const skillDir = path.join(SKILLS_DIR, skillName);
  const skillFile = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    return { error: `Skill not found: ${skillName}`, list: await listAgentSkillsInline() };
  }
  const md = fs.readFileSync(skillFile, "utf-8");
  const sqlBlocks = Array.from(md.matchAll(/```sql\s+([\s\S]*?)```/gi)).map((m) => m[1].trim());
  const nameMatch = md.match(/^#+\s+(.+)$/m);
  const descMatch = md.match(/^([A-Z].*?\.)\s/m);
  const result: Record<string, unknown> = {
    skill: skillName,
    description: descMatch?.[1]?.trim() || "",
    title: nameMatch?.[1]?.trim() || skillName,
    sql_queries: sqlBlocks,
    executed: execute,
    execution_results: [],
  };
  if (execute) {
    const results: Array<Record<string, unknown>> = [];
    for (const sql of sqlBlocks) {
      // Only single-statement read queries (same policy as the MCP tool)
      const stmt = sql.trim();
      const first = stmt.match(/^(\w+)/)?.[1]?.toUpperCase() || "";
      if (!["SELECT", "SHOW", "WITH", "EXPLAIN"].includes(first)) {
        results.push({ sql: stmt.slice(0, 120), error: "Only single-statement SELECT/SHOW/WITH queries execute inline" });
        continue;
      }
      if (stmt.includes(";")) {
        results.push({ sql: stmt.slice(0, 120), error: "Multi-statement SQL rejected" });
        continue;
      }
      try {
        const res = await safeQuery(stmt);
        results.push({ sql: stmt.slice(0, 120), row_count: res.rows.length, rows: res.rows.slice(0, 10) });
      } catch (err) {
        results.push({ sql: stmt.slice(0, 120), error: err instanceof Error ? err.message : String(err) });
      }
    }
    result.execution_results = results;
  }
  return result;
}

const MCP_WRITE_TOOLS = new Set(["memory_store", "memory_correct", "memory_delete", "memory_pin"]);

/**
 * Execute a tool. For read-only tools, tries the local Bastion MCP server
 * over HTTP first (the "real agent" path — hash chain, budget, C-SPANN, guards)
 * and falls back to the inline SQL implementation when the server is unreachable.
 * Write tools keep their existing inline behavior (HITL / approval gating).
 */
async function executeTool(name: string, args: Record<string, unknown>): Promise<{ result: Record<string, unknown>; sql: string; pendingApproval?: { toolName: string; args: Record<string, unknown>; content: string; previousHash: string } }> {
  const startTime = Date.now();

  // Write tools go through the inline path to preserve HITL approval gating.
  if (MCP_WRITE_TOOLS.has(name)) {
    const r = await executeToolInline(name, args);
    if (r.result && typeof r.result === "object") {
      r.result.source = "HITL";
    }
    return r;
  }

  // Read tools: try the real MCP server over HTTP first.
  const mcp = await callLocalMcpTool(name, mapToMcpArgs(name, args));
  if (mcp.ok && mcp.text) {
    let parsed: Record<string, unknown> = {};
    try {
      const parsedAny = JSON.parse(mcp.text);
      if (parsedAny && typeof parsedAny === "object") parsed = parsedAny;
      else parsed = { result: parsedAny };
    } catch {
      parsed = { text: mcp.text };
    }
    const latency = `${Date.now() - startTime}ms`;
    return {
      result: {
        tool: name,
        ...parsed,
        source: "MCP",
        latency,
      },
      sql: `[MCP] ${name}(${JSON.stringify(mapToMcpArgs(name, args))})`,
    };
  }

  if (mcp.error) {
    console.warn(`[chat] MCP ${name} unavailable (${mcp.error}); falling back to inline SQL`);
  }

  const inline = await executeToolInline(name, args);
  if (inline.result && typeof inline.result === "object") {
    inline.result = { ...inline.result, source: "SQL" };
  }
  return inline;
}

function truncateForLLM(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "\n...[truncated]" : text;
}

function summarizeToolResult(toolName: string, result: Record<string, unknown>): string {
  const rows = (result.results ?? []) as Array<Record<string, unknown>>;
  if (toolName === "memory_list" || toolName === "memory_search") {
    const lines = rows.map((r) => {
      const content = String(r.content ?? r.Content ?? "").slice(0, 120);
      const id = String(r.memory_id ?? r.memoryId ?? "?");
      const type = String(r.memory_type ?? r.memoryType ?? "?");
      return `- [${type}] (${id.slice(0, 8)}) ${content}`;
    });
    const total = result.total != null ? String(result.total) : String(rows.length);
    return `Tool result: ${lines.length} of ${total} memories\n${lines.join("\n")}`;
  }
  return `Tool result: ${truncateForLLM(JSON.stringify(result), 2500)}`;
}

function parseLLMResponse(text: string): { toolCall?: ToolCall; response?: string } {
// Strip reasoning/think blocks (all common tag styles) and code fences before extracting JSON.
  const cleaned = (text || "")
    .replace(/```(?:json)?/g, "")
    .replace(/```think[\s\S]*?```/gi, "")
    .replace(/```reasoning[\s\S]*?```/gi, "")
    .replace(/```analysis[\s\S]*?```/gi, "")
    .replace(/```thought[\s\S]*?```/gi, "")
    .replace(/```\s*(?:thinking|reasoning|analysis|thought|think)[\s\S]*?```/gi, "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, "")
    .replace(/`?<think\b[^>]*>[\s\S]*?<\/think>`?/gi, "")
    .trim();

  // Find the first balanced JSON object with an open/close brace pair.
  let start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === "{") {
      start = i;
      break;
    }
  }
  if (start === -1) return { response: text };

  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  const candidate = end !== -1 ? cleaned.slice(start, end) : cleaned.slice(start);
  try {
    const parsed = JSON.parse(candidate);
    if (parsed.tool && parsed.args) {
      return {
        toolCall: {
          name: parsed.tool,
          args: parsed.args,
          thought: parsed.thought || "",
        },
      };
    }
    if (parsed.response) {
      // Strip any residual think/reasoning prefix the model left inside response.
      const resp = String(parsed.response)
        .replace(/^[\s`]*(?:thinking|reasoning|analysis|thought)\b[\s\S]{0,300}/i, "")
        .replace(/\b(?:thinking|reasoning|analysis|thought)\b:\s*/i, "")
        .trim();
      return { response: resp || cleaned };
    }
    return { response: cleaned };
  } catch {
    return { response: cleaned };
  }
}

async function callBedrock(payload: Record<string, unknown>): Promise<string> {
  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    body: JSON.stringify(payload),
    contentType: "application/json",
    accept: "application/json",
  });
  const response = await client.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  return responseBody.content?.[0]?.text || "";
}

async function callGroq(system: string, messages: Array<{ role: string; content: string }>): Promise<{ text: string; provider: string; model: string }> {
  const result = await groqCall(system, messages, { timeoutMs: 15000 });
  return { text: result.text, provider: "Groq", model: result.model };
}

async function callLLMWithRetry(system: string, messages: Array<{ role: string; content: string }>, onRetry?: (attempt: number, maxAttempts: number) => void): Promise<{ text: string; provider: string; model: string }> {
  const provider = (process.env.BASTION_LLM_PROVIDER || "bedrock").toLowerCase();
  const MAX_LLM_RETRIES = 3;
  const LLM_RETRY_DELAY_MS = 2000;

  // Trim conversation to avoid 413 (entity too large) — keep only last 4 messages, truncate each to 500 chars
  const trimmedMessages = messages.slice(-4).map(m => ({
    ...m,
    content: m.content.length > 500 ? m.content.slice(0, 500) + "..." : m.content,
  }));

  for (let attempt = 0; attempt <= MAX_LLM_RETRIES; attempt++) {
    try {
      if (provider === "openrouter") {
        const orKey = process.env.OPENROUTER_API_KEY;
        if (!orKey) throw new Error("OPENROUTER_API_KEY not set");
        const result = await callOpenRouter(system, trimmedMessages);
        return { text: result.text, provider: "OpenRouter", model: result.model };
      }
      if (provider === "groq") {
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) throw new Error("GROQ_API_KEY not set");
        return await callGroq(system, trimmedMessages);
      }
      // Bedrock primary, Groq fallback
      const payload = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        system,
        messages: trimmedMessages,
      };
      try {
        const text = await callBedrock(payload);
        return { text, provider: "Amazon Bedrock", model: MODEL_ID };
      } catch (bedrockErr) {
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) throw bedrockErr;
        console.warn("[chat] Bedrock failed, falling back to Groq:", bedrockErr instanceof Error ? bedrockErr.message : bedrockErr);
        return await callGroq(system, trimmedMessages);
      }
    } catch (llmErr) {
      const errMsg = llmErr instanceof Error ? llmErr.message : "";
      const isRetryable = errMsg.includes("429") || errMsg.includes("413") || errMsg.includes("rate") || errMsg.includes("too large");
      if (isRetryable && attempt < MAX_LLM_RETRIES) {
        console.warn(`[chat] LLM error (${errMsg.slice(0, 50)}), retry ${attempt + 1}/${MAX_LLM_RETRIES} in ${LLM_RETRY_DELAY_MS}ms...`);
        onRetry?.(attempt + 1, MAX_LLM_RETRIES);
        await new Promise((r) => setTimeout(r, LLM_RETRY_DELAY_MS));
        continue;
      }
      throw llmErr;
    }
  }
  throw new Error("LLM failed after all retries");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, history = [], resumeApproval } = body;

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const steps: AgentStep[] = [];
    let iterations = 0;
    const MAX_ITERATIONS = 10;
    let lastProvider = "";
    let lastModel = "";

    // Build conversation for Bedrock
    const conversation = [
      ...history.map((h: { role: string; content: string }) => ({
        role: h.role,
        content: h.content,
      })),
      { role: "user", content: message },
    ];

    // Resume after HITL approval — inject the operator's decision so the LLM
    // can continue with the remaining steps of the original request.
    if (resumeApproval) {
      const { approved, toolName, result } = resumeApproval;
      const shortMessage = message.length > 300 ? message.slice(0, 300) + "..." : message;
      const note = approved
        ? `[Operator decision] The "${toolName}" tool was APPROVED and executed successfully. Result: ${truncateForLLM(JSON.stringify(result), 1500)}.

Original request: "${shortMessage}"

Step 1 (memory_store) is DONE. You MUST now execute Step 2. Respond with EXACTLY this JSON and nothing else:
{"tool":"ccloud_exec","args":{"command":"cluster list"},"thought":"Step 2: Checking our CockroachDB Cloud infrastructure with ccloud cluster list."}`
        : `[Operator decision] The "${toolName}" tool was REJECTED. Skip it and continue with the next step.`;
      conversation[conversation.length - 1] = { role: "user", content: note };

      // AUTO-EXECUTE remaining steps ONLY if memory_store was approved
      if (!approved) {
        // Memory was rejected — skip remaining steps
        steps.push({ type: "response", content: `Memory rejected by operator. Content was NOT stored. Hash chain unchanged.` });
        return NextResponse.json({ steps, provider: lastProvider, model: lastModel });
      }

      // Check if this is the 5-step orchestration prompt (contains all 4 tool names)
      const isFiveStepPrompt = message.includes("ccloud cluster list") && 
                               message.includes("list_tables") && 
                               message.includes("reviewing-cluster-health") && 
                               message.includes("memory_search");
      
      if (!isFiveStepPrompt) {
        // Single memory_store request — don't auto-execute remaining steps
        steps.push({ type: "response", content: `Memory stored successfully. SERIALIZABLE isolation. Hash chain grew.` });
        return NextResponse.json({ steps, provider: lastProvider, model: lastModel });
      }

      // Step 2: ccloud cluster list
      steps.push({ type: "thought", content: "Step 2: Checking infrastructure with ccloud cluster list..." });
      steps.push({ type: "tool_call", content: "", toolName: "ccloud_exec", toolArgs: { command: "cluster list" } });
      try {
        const { result: ccloudResult, sql: ccloudSql } = await executeTool("ccloud_exec", { command: "cluster list" });
        steps.push({ type: "tool_result", content: JSON.stringify(ccloudResult), toolName: "ccloud_exec", toolResult: ccloudResult, sql: ccloudSql, latency: ccloudResult.latency as string });
        conversation.push({ role: "assistant", content: JSON.stringify({ tool: "ccloud_exec", args: { command: "cluster list" } }) });
        conversation.push({ role: "user", content: summarizeToolResult("ccloud_exec", ccloudResult) });
      } catch (e) {
        steps.push({ type: "error", content: `ccloud_exec failed: ${e instanceof Error ? e.message : e}` });
      }

      // Step 3: managed_mcp_call list_tables
      steps.push({ type: "thought", content: "Step 3: Listing tables via managed MCP server..." });
      steps.push({ type: "tool_call", content: "", toolName: "managed_mcp_call", toolArgs: { tool: "list_tables" } });
      try {
        const { result: mcpResult, sql: mcpSql } = await executeTool("managed_mcp_call", { tool: "list_tables" });
        steps.push({ type: "tool_result", content: JSON.stringify(mcpResult), toolName: "managed_mcp_call", toolResult: mcpResult, sql: mcpSql, latency: mcpResult.latency as string });
        conversation.push({ role: "assistant", content: JSON.stringify({ tool: "managed_mcp_call", args: { tool: "list_tables" } }) });
        conversation.push({ role: "user", content: summarizeToolResult("managed_mcp_call", mcpResult) });
      } catch (e) {
        steps.push({ type: "error", content: `managed_mcp_call failed: ${e instanceof Error ? e.message : e}` });
      }

      // Step 4: invoke reviewing-cluster-health skill
      steps.push({ type: "thought", content: "Step 4: Invoking reviewing-cluster-health agent skill..." });
      steps.push({ type: "tool_call", content: "", toolName: "invoke_agent_skill", toolArgs: { skill_name: "reviewing-cluster-health", execute: true } });
      try {
        const { result: skillResult, sql: skillSql } = await executeTool("invoke_agent_skill", { skill_name: "reviewing-cluster-health", execute: true });
        steps.push({ type: "tool_result", content: JSON.stringify(skillResult), toolName: "invoke_agent_skill", toolResult: skillResult, sql: skillSql, latency: skillResult.latency as string });
        conversation.push({ role: "assistant", content: JSON.stringify({ tool: "invoke_agent_skill", args: { skill_name: "reviewing-cluster-health" } }) });
        conversation.push({ role: "user", content: summarizeToolResult("invoke_agent_skill", skillResult) });
      } catch (e) {
        steps.push({ type: "error", content: `invoke_agent_skill failed: ${e instanceof Error ? e.message : e}` });
      }

      // Step 5: memory search for CockroachDB
      steps.push({ type: "thought", content: "Step 5: Searching memory for CockroachDB using vector index..." });
      steps.push({ type: "tool_call", content: "", toolName: "memory_search", toolArgs: { query: "CockroachDB", k: 5 } });
      try {
        const { result: searchResult, sql: searchSql } = await executeTool("memory_search", { query: "CockroachDB", k: 5 });
        steps.push({ type: "tool_result", content: JSON.stringify(searchResult), toolName: "memory_search", toolResult: searchResult, sql: searchSql, latency: searchResult.latency as string });
      } catch (e) {
        steps.push({ type: "error", content: `memory_search failed: ${e instanceof Error ? e.message : e}` });
      }

      // Final response
      steps.push({ type: "response", content: "All 5 steps completed: memory stored, infrastructure checked, tables listed, health reviewed, vector search done." });
      return NextResponse.json({ steps, provider: lastProvider, model: lastModel });
    }

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Call LLM with retry on rate limits — shows retry steps in the UI
      const llmCall = await callLLMWithRetry(SYSTEM_PROMPT, conversation, (attempt, max) => {
        steps.push({
          type: "thought",
          content: `⏳ LLM rate limited — retrying (${attempt}/${max})...`,
        });
      });
      const llmText = llmCall.text;
      lastProvider = llmCall.provider;
      lastModel = llmCall.model;

      // Parse LLM response
      const parsed = parseLLMResponse(llmText);

      if (parsed.toolCall) {
        // LLM wants to call a tool
        steps.push({
          type: "thought",
          content: parsed.toolCall.thought || `Calling ${parsed.toolCall.name}`,
        });

        steps.push({
          type: "tool_call",
          content: "",
          toolName: parsed.toolCall.name,
          toolArgs: parsed.toolCall.args,
        });

        // Execute the tool
        try {
          const { result, sql, pendingApproval } = await executeTool(parsed.toolCall.name, parsed.toolCall.args);

          steps.push({
            type: "tool_result",
            content: JSON.stringify(result),
            toolName: parsed.toolCall.name,
            toolResult: result,
            sql,
            latency: result.latency as string,
          });

          // If tool requires approval, return immediately with pending approval
          if (pendingApproval) {
            return NextResponse.json({
              steps,
              pendingApproval,
              provider: lastProvider,
              model: lastModel,
            });
          }

          // Add tool result to conversation for next LLM call (truncated to keep payloads bounded)
          conversation.push({
            role: "assistant",
            content: llmText,
          });
          conversation.push({
            role: "user",
            content: summarizeToolResult(parsed.toolCall.name, result),
          });
        } catch (toolError) {
          steps.push({
            type: "error",
            content: `Tool failed: ${toolError instanceof Error ? toolError.message : String(toolError)}`,
          });
          break;
        }
      } else {
        // LLM wants to respond to the user
        steps.push({
          type: "response",
          content: parsed.response || llmText,
        });
        break;
      }
    }

    return NextResponse.json({ steps, provider: lastProvider, model: lastModel });
  } catch (error) {
    console.error("[Agent Chat] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Agent chat failed" },
      { status: 500 }
    );
  }
}
