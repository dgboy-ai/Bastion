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

    const CLUSTER_ID = '9a423301-d502-42f4-a5e5-1e7664e4e025';

    // Extract authorization from incoming request headers, fallback to env-configured API key
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization') || (process.env.COCKROACHDB_MCP_API_KEY ? `Bearer ${process.env.COCKROACHDB_MCP_API_KEY}` : '');

    const response = await fetch(MANAGED_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
        ...(CLUSTER_ID ? { 'mcp-cluster-id': CLUSTER_ID } : {}),
        'crdb-mcp-enable-write-queries': 'true'
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
