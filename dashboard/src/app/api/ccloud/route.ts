import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

const CCLOUD_PATH = process.env.CCLOUD_PATH || 'ccloud';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { command } = body;

    if (!command) {
      return NextResponse.json({ error: 'command is required' }, { status: 400 });
    }

    // Security: only allow safe read-only commands (ccloud 0.6.x valid subcommands)
    const allowedCommands = [
      'cluster list',
      'cluster info',
      'cluster regions',
      'cluster nodes',
      'auth whoami',
      'version',
    ];

    const isAllowed = allowedCommands.some((cmd) => command === cmd || command.startsWith(cmd + " "));
    if (!isAllowed) {
      return NextResponse.json(
        {
          error: 'Command not allowed',
          allowed: allowedCommands,
          note: 'Only read-only commands are permitted for security',
        },
        { status: 403 }
      );
    }

    // Execute ccloud command with JSON output
    const fullCommand = command.includes('--output')
      ? command
      : `${command} --output json`;

    const output = execSync(`${CCLOUD_PATH} ${fullCommand}`, {
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, PATH: `${process.env.APPDATA}/ccloud;${process.env.PATH}` },
    });

    try {
      const json = JSON.parse(output);
      return NextResponse.json({ result: json, command: fullCommand });
    } catch {
      return NextResponse.json({ result: output, command: fullCommand });
    }
  } catch (error: any) {
    // Handle auth required
    if (error.message?.includes('not logged in') || error.message?.includes('auth')) {
      return NextResponse.json(
        {
          error: 'ccloud not authenticated',
          status: 'auth_required',
          command: 'ccloud auth login --no-redirect',
          message: 'Run ccloud auth login on the server to authenticate',
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to execute ccloud command' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '0.6.12',
    path: CCLOUD_PATH,
    allowedCommands: [
      'cluster list — List all clusters',
      'cluster info — Get cluster details',
      'cluster regions — List available regions',
      'cluster nodes — List nodes',
      'auth whoami — Check authentication status',
      'version — Print version',
    ],
    note: 'ccloud CLI must be authenticated via `ccloud auth login` on the server',
  });
}
