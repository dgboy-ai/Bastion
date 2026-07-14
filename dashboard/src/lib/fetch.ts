const DEFAULT_TIMEOUT = 10_000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeout?: number },
): Promise<Response> {
  const timeout = init?.timeout ?? DEFAULT_TIMEOUT;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);

  // Propagate dynamic CockroachDB connection string from localStorage to API routes
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined") {
    const conn = localStorage.getItem("bastion_db_conn");
    if (conn) {
      headers.set("x-bastion-conn", conn);
    }
  }

  try {
    const res = await fetch(input, {
      ...init,
      headers,
      signal: ac.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

