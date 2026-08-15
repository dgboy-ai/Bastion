import { NextResponse } from "next/server";
import { checkMcpConnection } from "@/lib/local-mcp";

export const dynamic = "force-dynamic";

/**
 * Probe the local Bastion MCP server and report connectivity.
 * Used by the agent UI to show a clear degraded-mode notice when the
 * MCP server is not running (agent then falls back to inline SQL).
 */
export async function GET() {
  try {
    const mcp = await checkMcpConnection();
    return NextResponse.json({ mcp });
  } catch (error) {
    return NextResponse.json({
      mcp: {
        connected: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}
