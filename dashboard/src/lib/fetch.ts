const DEFAULT_TIMEOUT = 15_000;

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/bastion_csrf=([^;]+)/);
  return match ? match[1] : null;
}

const globalCache = new Map<string, { data: unknown, expiry: number }>();

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeout?: number },
): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  let savedConn = "";
  if (typeof window !== "undefined") {
    try {
      savedConn = sessionStorage.getItem("bastion_db_conn") || "";
    } catch {}
  }

  // Cache is scoped to the selected database so results can never cross
  // connections/tenants.
  const cacheKey = `${urlStr}::${savedConn}`;

  // Client-side cache for GET requests to speed up page transitions
  if (method === "GET" && typeof window !== "undefined") {
    const cached = globalCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  // Any write invalidates cached reads.
  if (method !== "GET") {
    globalCache.clear();
  }

  const timeout = init?.timeout ?? DEFAULT_TIMEOUT;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);

  const headers = new Headers(init?.headers);

  if (typeof window !== "undefined") {
    if (savedConn && !headers.has("x-bastion-conn")) {
      headers.set("x-bastion-conn", savedConn);
    }

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

    if (method === "GET" && res.ok && typeof window !== "undefined") {
      const cloned = res.clone();
      cloned.json().then(data => {
        globalCache.set(cacheKey, { data, expiry: Date.now() + 5000 }); // 5s cache
      }).catch(() => {});
    }

    return res;
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw e;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
