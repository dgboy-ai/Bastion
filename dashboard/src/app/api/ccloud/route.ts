import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { requireAuth } from "@/lib/api-auth";

const CCLOUD_PATH = process.env.CCLOUD_PATH || 'ccloud';

const ALLOWED_COMMANDS = [
  'cluster list',
  'cluster info',
  'cluster regions',
  'cluster nodes',
  'auth whoami',
  'version',
];

// Only allow inert tokens — no shell metacharacters, redirections, or spaces.
const SAFE_ARG = /^[a-zA-Z0-9_./:=@-]+$/;

function parseCcloudArgs(command: string): string[] | null {
  if (typeof command !== 'string') return null;
  const parts = command.trim().split(/\s+/);
  if (parts.length === 0 || parts.some((p) => !SAFE_ARG.test(p))) return null;
  const matches = ALLOWED_COMMANDS.some(
    (cmd) => command === cmd || command.startsWith(cmd + ' '),
  );
  if (!matches) return null;
  if (!parts.includes('--output')) parts.push('--output', 'json');
  return parts;
}

export async function POST(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    const { command } = body;

    if (!command) {
      return NextResponse.json({ error: 'command is required' }, { status: 400 });
    }

    // Security: only allow safe read-only commands (ccloud 0.6.x valid subcommands).
    const args = parseCcloudArgs(command);
    if (!args) {
      return NextResponse.json(
        {
          error: 'Command not allowed',
          allowed: ALLOWED_COMMANDS,
          note: 'Only read-only commands are permitted for security',
        },
        { status: 403 }
      );
    }

    // Execute without a shell so metacharacters can never be interpreted.
    const output = execFileSync(CCLOUD_PATH, args, {
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, PATH: `${process.env.APPDATA}/ccloud;${process.env.PATH}` },
    });

    try {
      const json = JSON.parse(output);
      return NextResponse.json({ result: json, command: args.join(' ') });
    } catch {
      return NextResponse.json({ result: output, command: args.join(' ') });
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
      { error: 'Failed to execute ccloud command' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) return authError;

  return NextResponse.json({
    status: 'ok',
    version: '0.6.12',
    allowedCommands: ALLOWED_COMMANDS,
    note: 'ccloud CLI must be authenticated via `ccloud auth login` on the server',
  });
}
