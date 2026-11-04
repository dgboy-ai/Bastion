import { NextResponse } from "next/server";
import { checkMcpConnection } from "@/lib/local-mcp";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * Probe the local Bastion MCP server and report connectivity.
 * Used by the agent UI to show a clear degraded-mode notice when the
 * MCP server is not running (agent then falls back to inline SQL).
 */
export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  try {
    const mcp = await checkMcpConnection();
    return NextResponse.json({ mcp });
  } catch (error) {
    return NextResponse.json({
      mcp: {
        connected: false,
        error: "MCP server unreachable",
      },
    });
  }
}
