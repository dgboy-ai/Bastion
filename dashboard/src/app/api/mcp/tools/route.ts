import { NextResponse } from "next/server";
import { mcpPost, MCP_URL } from "@/lib/local-mcp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data: initData, sessionId } = await mcpPost(
      MCP_URL,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "bastion-dashboard", version: "1.0.0" },
        },
      },
      undefined,
      8000
    );

    if (initData.error) {
      return NextResponse.json({ tools: [], error: initData.error.message });
    }

    const sid = sessionId || undefined;

    await mcpPost(
      MCP_URL,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      sid,
      5000
    ).catch(() => {});

    const { data: toolsData } = await mcpPost(
      MCP_URL,
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      sid,
      10000
    );

    const tools = toolsData?.result?.tools || [];

    // Dedupe by name — the MCP server already includes ccloud_exec,
    // managed_mcp_call, invoke_agent_skill, list_agent_skills, etc.
    const seen = new Set<string>();
    const unique = tools.filter((t: any) => {
      if (!t?.name || seen.has(t.name)) return false;
      seen.add(t.name);
      return true;
    });

    return NextResponse.json({ tools: unique });
  } catch (err) {
    return NextResponse.json({
      tools: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
