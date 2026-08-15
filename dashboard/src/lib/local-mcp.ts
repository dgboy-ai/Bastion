export interface McpToolResult {
  text: string;
  isError?: boolean;
}

export const MCP_URL = process.env.BASTION_MCP_URL || "http://localhost:9997/mcp";
const MCP_TIMEOUT_MS = Number(process.env.BASTION_MCP_TIMEOUT || "30") * 1000;

function authHeader(): string {
  const key = process.env.BASTION_MCP_API_KEY || process.env.BASTION_API_KEY || "";
  return key ? `Bearer ${key}` : "";
}

export async function mcpPost(
  url: string,
  body: unknown,
  sessionId?: string,
  timeoutMs = MCP_TIMEOUT_MS
): Promise<{ data: any; sessionId?: string; status: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  const auth = authHeader();
  if (auth) headers.Authorization = auth;
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  let data: any = {};
  if (text) {
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) {
      data = JSON.parse(trimmed);
    } else if (trimmed.startsWith("data:")) {
      // SSE stream
      for (const line of trimmed.split(/\r?\n/)) {
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            data = JSON.parse(payload);
            break;
          } catch {
            // ignore
          }
        }
      }
    } else {
      data = JSON.parse(trimmed);
    }
  }

  return { data, sessionId: res.headers.get("mcp-session-id") || undefined, status: res.status };
}

let cachedSessionId: string | undefined;

/**
 * Initialize an MCP session against the local Bastion MCP server.
 * FastMCP Streamable HTTP requires an initialize handshake before tools/call.
 */
async function ensureSession(): Promise<string | undefined> {
  if (cachedSessionId) return cachedSessionId;
  try {
    const { data, sessionId } = await mcpPost(
      MCP_URL,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "bastion-agent-chat", version: "1.0.0" },
        },
      },
      undefined,
      10000
    );
    if (data.error) throw new Error(`MCP initialize failed: ${data.error.message || JSON.stringify(data.error)}`);
    if (sessionId) cachedSessionId = sessionId;
    // Send initialized notification (fire and forget)
    await mcpPost(
      MCP_URL,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      sessionId,
      5000
    ).catch(() => {});
    return sessionId;
  } catch {
    return undefined;
  }
}

export interface LocalMcpCallResult {
  ok: boolean;
  text?: string;
  isError?: boolean;
  error?: string;
}

/**
 * Call a tool on the local Bastion MCP server over Streamable HTTP.
 * Returns { ok: false, error } on connection failure so callers can fall back.
 */
export async function callLocalMcpTool(name: string, args: Record<string, unknown>): Promise<LocalMcpCallResult> {
  try {
    const sessionId = await ensureSession();
    const { data, status } = await mcpPost(
      MCP_URL,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name, arguments: args },
      },
      sessionId
    );
    if (data.error) {
      return { ok: false, error: data.error.message || JSON.stringify(data.error) };
    }
    if (!data.result) {
      return { ok: false, error: `MCP server returned status ${status} with no result` };
    }
    const content = Array.isArray(data.result.content) ? data.result.content : [];
    const text = content
      .filter((c: any) => c && typeof c.text === "string")
      .map((c: any) => c.text)
      .join("\n");
    return { ok: true, text, isError: !!data.result.isError };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface McpConnectionStatus {
  connected: boolean;
  serverName?: string;
  version?: string;
  error?: string;
}

/**
 * Probe the local Bastion MCP server with the initialize handshake.
 * Returns { connected: false, error } when the server is unreachable or
 * rejects the request, so the UI can show a clear degraded-mode notice.
 */
export async function checkMcpConnection(): Promise<McpConnectionStatus> {
  try {
    const { data, sessionId } = await mcpPost(
      MCP_URL,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "bastion-agent-chat", version: "1.0.0" },
        },
      },
      undefined,
      8000
    );
    if (data.error) {
      return {
        connected: false,
        error: data.error.message || JSON.stringify(data.error),
      };
    }
    if (sessionId) cachedSessionId = sessionId;
    await mcpPost(
      MCP_URL,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      sessionId,
      5000
    ).catch(() => {});
    return {
      connected: true,
      serverName: data.result?.serverInfo?.name,
      version: data.result?.serverInfo?.version,
    };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
