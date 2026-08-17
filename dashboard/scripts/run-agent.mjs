#!/usr/bin/env node
/**
 * Bastion agent CLI — runs the full agent loop headlessly in the terminal.
 * Uses groq (from .env.local) as the LLM and talks to the local MCP server
 * (:9997) directly over HTTP. Prints every thought + tool call + result.
 *
 * Usage:  node scripts/run-agent.mjs "your message"
 *         node scripts/run-agent.mjs --tools         # list MCP tools only
 *         node scripts/run-agent.mjs --managed-tools # list managed MCP tools
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/* ── Load .env.local ─────────────────────────────────────── */
function loadEnv() {
  const envFile = resolve(ROOT, ".env.local");
  try {
    const raw = readFileSync(envFile, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch (e) {
    console.error("[agent] could not read .env.local:", e.message);
    process.exit(1);
  }
}
loadEnv();

const MCP_URL = process.env.BASTION_MCP_URL || "http://localhost:9997/mcp";
const MCP_KEY = process.env.BASTION_MCP_API_KEY || process.env.BASTION_API_KEY || "";
const GROQ_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.6-27b";
const MAX_ITERATIONS = 8;

/* ── MCP client ──────────────────────────────────────────── */
let sessionId = null;
const headers = () => {
  const h = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (MCP_KEY) h.Authorization = `Bearer ${MCP_KEY}`;
  if (sessionId) h["Mcp-Session-Id"] = sessionId;
  return h;
};

async function mcpCall(method, params = {}, timeoutMs = 30000) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!sessionId) sessionId = res.headers.get("mcp-session-id");
  let data = {};
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) data = JSON.parse(trimmed);
  else if (trimmed.startsWith("data:")) {
    for (const line of trimmed.split(/\r?\n/)) {
      if (line.startsWith("data:")) {
        const p = line.slice(5).trim();
        if (!p || p === "[DONE]") continue;
        try { data = JSON.parse(p); break; } catch { /* skip */ }
      }
    }
  } else data = JSON.parse(trimmed);
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data;
}

async function mcpInit() {
  await mcpCall("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "bastion-agent-cli", version: "1.0.0" },
  });
  try { await mcpCall("notifications/initialized"); } catch { /* ok */ }
}

async function mcpListTools() {
  const d = await mcpCall("tools/list", {});
  return (d.result?.tools || []).map((t) => t.name);
}

async function mcpCallTool(name, args) {
  const d = await mcpCall("tools/call", { name, arguments: args }, 60000);
  const content = Array.isArray(d.result?.content) ? d.result.content : [];
  const text = content.filter((c) => c && typeof c.text === "string").map((c) => c.text).join("\n");
  return text;
}

/* ── Groq LLM ────────────────────────────────────────────── */
async function callGroq(system, messages) {
  if (!GROQ_KEY) throw new Error("GROQ_API_KEY is not set in .env.local");
  let lastErr = null;
  for (let attempt = 0; attempt <= 4; attempt++) {
    if (attempt > 0) {
      const delay = 1000 * 2 ** attempt;
      console.log(`\n   [groq] rate limited, retrying in ${delay / 1000}s (attempt ${attempt}/4)...`);
      await new Promise((r) => setTimeout(r, delay));
    }
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: "system", content: system }, ...messages], temperature: 0.3, max_tokens: 4096 }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) {
        const t = await res.text();
        if (res.status === 429) { lastErr = new Error("Groq rate limited (429)"); continue; }
        throw new Error(`Groq API ${res.status}: ${t.slice(0, 200)}`);
      }
      const data = await res.json();
      const choice = data.choices?.[0];
      return (choice?.message?.content || choice?.message?.reasoning || "").trim();
    } catch (e) {
      if (e instanceof Error && /rate limited|429/i.test(e.message)) { lastErr = e; continue; }
      throw e;
    }
  }
  throw lastErr || new Error("Groq API request failed");
}

const SYSTEM_PROMPT = `You are Bastion, an autonomous security-hardened memory agent backed by CockroachDB.

You have access to these tools on a local MCP server:
- memory_search: Search memories by semantic similarity
- memory_list: List recent memories
- memory_store: Store a new memory with hash chain integrity
- memory_timetravel: Query memory state at a past timestamp
- memory_audit: View the append-only audit log
- memory_health: Check memory system health
- memory_correct: Update an existing memory's content
- managed_mcp_list_tools: List tools on the CockroachDB Cloud Managed MCP Server
- managed_mcp_call: Run a tool on the CockroachDB Cloud Managed MCP Server (list_clusters, get_cluster, list_databases, list_tables, get_table_schema, select_query, explain_query). Args: tool, params.
- ccloud_exec: Run a CockroachDB Cloud CLI (ccloud) command. Args: command (e.g. "cluster list"), args (array).
- list_agent_skills: List available CockroachDB Agent Skill playbooks.
- invoke_agent_skill: Execute a CockroachDB Agent Skill playbook. Args: skill_name, execute.
- multi_signal_search: Hybrid search (vector + keyword + temporal).

RULES:
1. Think step-by-step before acting
2. For searches, use memory_search with the user's query
3. For stores, first explain what you'll store, then call memory_store
4. Always mention SERIALIZABLE isolation and hash chain growth when storing
5. If the user asks about the cluster (health, tables, schema, SQL) — use managed_mcp_call, ccloud_exec, or invoke_agent_skill
6. Prefer real tools over fabricating cluster facts
7. Execute ALL steps the user requested, in order — do not stop after one tool

CRITICAL OUTPUT FORMAT:
- Your ENTIRE reply must be exactly ONE JSON object. No text before or after. No code fences. No think/reasoning blocks.
- To call a tool: {"tool": "tool_name", "args": {...}, "thought": "..."}
- To respond: {"response": "..."}`;

/* ── Agent loop ──────────────────────────────────────────── */
function parseLLM(text) {
  const cleaned = (text || "").replace(/```(?:json)?/g, "").trim();
  let start = cleaned.indexOf("{");
  if (start === -1) return { response: text };
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const candidate = end !== -1 ? cleaned.slice(start, end) : cleaned.slice(start);
  try {
    const p = JSON.parse(candidate);
    if (p.tool && p.args) return { toolCall: { name: p.tool, args: p.args, thought: p.thought || "" } };
    if (p.response) return { response: String(p.response) };
    return { response: cleaned };
  } catch { return { response: cleaned }; }
}

function summarize(toolName, text) {
  if (!text) return "Tool result: (empty)";
  try {
    const p = JSON.parse(text);
    const rows = p.results || p.memories || p.entries || [];
    if (Array.isArray(rows) && rows.length) {
      const lines = rows.slice(0, 10).map((r) => {
        const c = String(r.content ?? r.Content ?? "").slice(0, 100);
        return `- ${c}`;
      });
      return `Tool result: ${rows.length} rows\n${lines.join("\n")}`;
    }
    return `Tool result: ${text.slice(0, 1500)}`;
  } catch { return `Tool result: ${text.slice(0, 1500)}`; }
}

async function runAgent(message, history = []) {
  console.log("\n" + "=".repeat(60));
  console.log(`🤖 USER: ${message}`);
  console.log("=".repeat(60) + "\n");

  await mcpInit();
  const tools = await mcpListTools();
  console.log(`📦 MCP server: ${tools.length} tools available\n`);

  const conversation = [
    ...history,
    { role: "user", content: message },
  ];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    process.stdout.write(`\n🧠 (iteration ${iter + 1}/${MAX_ITERATIONS}) thinking...`);
    const llmText = await callGroq(SYSTEM_PROMPT, conversation);
    const parsed = parseLLM(llmText);

    if (parsed.toolCall) {
      const { name, args, thought } = parsed.toolCall;
      if (thought) console.log(`\n💭 ${thought}`);
      console.log(`\n🛠️  CALLING ${name}(${JSON.stringify(args)})`);
      try {
        const text = await mcpCallTool(name, args);
        console.log(`✅ DONE (${name})`);
        console.log("┌─ result ─────────────────────────────");
        console.log(text.slice(0, 2000));
        console.log("└──────────────────────────────────────");
        conversation.push({ role: "assistant", content: llmText });
        conversation.push({ role: "user", content: summarize(name, text) });
        continue;
      } catch (e) {
        console.log(`❌ TOOL ERROR: ${e.message}`);
        conversation.push({ role: "assistant", content: llmText });
        conversation.push({ role: "user", content: `The tool ${name} failed: ${e.message}` });
        continue;
      }
    }

    console.log(`\n💬 FINAL: ${parsed.response}`);
    return parsed.response;
  }

  console.log("\n⚠️  Max iterations reached without final response.");
  return null;
}

/* ── Main ────────────────────────────────────────────────── */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--tools")) {
    await mcpInit();
    const tools = await mcpListTools();
    console.log(`\n📦 MCP server tools (${tools.length}):`);
    tools.forEach((t, i) => console.log(`  ${String(i + 1).padStart(2)}. ${t}`));
    return;
  }

  if (args.includes("--managed-tools")) {
    await mcpInit();
    const text = await mcpCallTool("managed_mcp_list_tools", {});
    console.log("\n📦 Managed MCP tools:");
    console.log(text);
    return;
  }

  const message = args.join(" ");
  if (!message) {
    console.log("Usage:");
    console.log("  node scripts/run-agent.mjs \"your message\"   # run the agent");
    console.log("  node scripts/run-agent.mjs --tools            # list MCP tools");
    console.log("  node scripts/run-agent.mjs --managed-tools    # list managed MCP tools");
    process.exit(1);
  }

  await runAgent(message);
}

main().catch((e) => {
  console.error("\n❌ Fatal:", e.message);
  process.exit(1);
});
