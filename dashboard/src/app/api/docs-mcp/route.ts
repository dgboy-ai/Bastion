import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";

const DOCS_MCP_URL = "https://cockroachdb.mcp.kapa.ai";
const TIMEOUT = 15000;

export async function POST(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  try {
    let body;
    try {
      const text = await request.text();
      if (text.length > 100000) return apiError("Body too large (max 100KB)", 413);
      body = JSON.parse(text);
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    const { query, tool = "search_docs", params = {} } = body;
    if (!query && tool === "search_docs") return apiError("query is required for search_docs", 400);

    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT);

      const res = await fetch(DOCS_MCP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "tools/call",
          params: {
            name: tool,
            arguments: { query, ...params },
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) throw new Error(`Docs MCP returned ${res.status}`);
      const data = await res.json();

      return apiSuccess({
        tool,
        query,
        result: data?.result?.content || data,
        latency: (Date.now() - startTime) + "ms",
        source: "docs-mcp",
      }, "dynamic");
    } catch (err) {
      return apiSuccess({
        tool,
        query,
        result: `Docs MCP unavailable (expected in dev without network). Query: "${query}"`,
        fallback: true,
        latency: (Date.now() - startTime) + "ms",
      }, "dynamic");
    }
  } catch (err) {
    console.error("[api/docs-mcp] failed:", err instanceof Error ? err.message : "Unknown error");
    return apiError("Docs MCP failed", 500);
  }
}

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  return apiSuccess({
    endpoint: DOCS_MCP_URL,
    tools: ["search_docs", "get_started", "find_tutorial"],
    description: "Public CockroachDB documentation MCP",
    auth: "none (upstream public)",
  }, "static");
}
