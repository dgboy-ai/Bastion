const DEFAULT_TIMEOUT = 10_000;

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/bastion_csrf=([^;]+)/);
  return match ? match[1] : null;
}

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

    // Auto-attach CSRF token for state-changing methods
    const method = (init?.method || "GET").toUpperCase();
    if (method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH") {
      const csrfToken = getCsrfToken();
      if (csrfToken && !headers.has("x-csrf-token")) {
        headers.set("x-csrf-token", csrfToken);
      }
    }
  }

  try {
    const res = await fetch(input, {
      ...init,
      headers,
      signal: ac.signal,
      credentials: "include",
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}
