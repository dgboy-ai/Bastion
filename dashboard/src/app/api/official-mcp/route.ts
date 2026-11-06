import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/api-auth";

const MANAGED_MCP_URL = 'https://cockroachlabs.cloud/mcp';
const CLUSTER_ID =
  process.env.COCKROACHDB_MCP_CLUSTER_ID || process.env.COCKROACHDB_CLUSTER_ID || '';

const READ_TOOLS = [
  'list_clusters',
  'get_cluster',
  'list_databases',
  'list_tables',
  'get_table_schema',
  'select_query',
  'explain_query',
  'show_statement',
  'show_running_queries',
];
const WRITE_TOOLS = ['create_database', 'create_table', 'insert_rows'];
const ALLOW_WRITES = process.env.BASTION_MCP_ALLOW_WRITES === 'true';

export async function POST(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    const { tool, args = {} } = body;

    if (!tool) {
      return NextResponse.json({ error: 'tool is required' }, { status: 400 });
    }
    if (!READ_TOOLS.includes(tool) && !WRITE_TOOLS.includes(tool)) {
      return NextResponse.json({ error: `Tool not allowed: ${tool}` }, { status: 403 });
    }
    if (WRITE_TOOLS.includes(tool) && !ALLOW_WRITES) {
      return NextResponse.json(
        { error: 'Write tools are disabled. Set BASTION_MCP_ALLOW_WRITES=true to enable.' },
        { status: 403 },
      );
    }

    // Build JSON-RPC request for the managed MCP server
    const mcpRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: tool,
        arguments: args,
      },
    };

    // Always use the server-held credential — never proxy a caller-supplied token.
    const apiKey = process.env.COCKROACHDB_MCP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Managed MCP is not configured' }, { status: 503 });
    }

    const response = await fetch(MANAGED_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(CLUSTER_ID ? { 'mcp-cluster-id': CLUSTER_ID } : {}),
        'crdb-mcp-enable-write-queries': ALLOW_WRITES ? 'true' : 'false',
      },
      body: JSON.stringify(mcpRequest),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `MCP server returned ${response.status}` },
        { status: response.status }
      );
    }

    const text = await response.text();
    let result: any = {};
    if (text) {
      try {
        result = JSON.parse(text);
      } catch {
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              result = JSON.parse(line.slice(6));
              break;
            } catch {
              // ignore non-JSON data chunks
            }
          }
        }
      }
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: 'Failed to call managed MCP server' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) return authError;

  return NextResponse.json({
    status: 'ok',
    endpoint: MANAGED_MCP_URL,
    auth: 'OAuth (recommended) or API key via service account (Advanced plan)',
    configured: Boolean(CLUSTER_ID && process.env.COCKROACHDB_MCP_API_KEY),
    tools: [...READ_TOOLS, ...(ALLOW_WRITES ? WRITE_TOOLS : [])],
    note: 'Proxies to the official CockroachDB Cloud Managed MCP. Cluster identity is held server-side.',
  });
}
