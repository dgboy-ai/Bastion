import { NextRequest, NextResponse } from 'next/server';

const MANAGED_MCP_URL = 'https://cockroachlabs.cloud/mcp';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tool, args = {} } = body;

    if (!tool) {
      return NextResponse.json({ error: 'tool is required' }, { status: 400 });
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

    const response = await fetch(MANAGED_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.COCKROACHDB_MCP_API_KEY
          ? { Authorization: `Bearer ${process.env.COCKROACHDB_MCP_API_KEY}` }
          : {}),
      },
      body: JSON.stringify(mcpRequest),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `MCP server returned ${response.status}`, details: text },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to call managed MCP server' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: MANAGED_MCP_URL,
    auth: 'OAuth (recommended) or API key via service account (Advanced plan)',
    clusterId: '9a423301-d502-42f4-a5e5-1e7664e4e025',
    tools: [
      'list_clusters',
      'get_cluster',
      'list_databases',
      'list_tables',
      'get_table_schema',
      'select_query',
      'explain_query',
      'show_statement',
      'show_running_queries',
      'create_database',
      'create_table',
      'insert_rows',
    ],
    oauthConfig: {
      url: 'https://cockroachlabs.cloud/mcp',
      clusterId: '9a423301-d502-42f4-a5e5-1e7664e4e025',
      header: 'mcp-cluster-id',
      note: 'Add mcp-cluster-id header to scope queries to our cluster. OAuth flow works on all plans.',
    },
    plan: 'Basic (OAuth browser flow)',
    note: 'Proxies to the official CockroachDB Cloud Managed MCP. OAuth flow opens in browser.',
    clusterName: 'bastion-memory',
    region: 'aws-ap-south-1',
  });
}
