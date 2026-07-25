const DEFAULT_TIMEOUT = 10_000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeout?: number },
): Promise<Response> {
  const timeout = init?.timeout ?? DEFAULT_TIMEOUT;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);

  const headers = new Headers(init?.headers);

  if (typeof window !== "undefined") {
    try {
      const savedConn = localStorage.getItem("bastion_db_conn");
      if (savedConn && !headers.has("x-bastion-conn")) {
        headers.set("x-bastion-conn", savedConn);
      }
    } catch {}
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
