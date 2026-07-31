import httpx, json, os

API_KEY = os.environ.get("BASTION_API_KEY", "")
H = {"Content-Type": "application/json", "Accept": "application/json", "Authorization": f"Bearer {API_KEY}"}

# Init
r = httpx.post("http://localhost:8005/mcp",
    json={"jsonrpc":"2.0","id":"init","method":"initialize",
          "params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}},
    headers=H, timeout=15)
sid = r.headers.get("mcp-session-id", "")
print(f"SID={sid}")

# Call memory_health
h2 = {**H, "Mcp-Session-Id": sid}
r2 = httpx.post("http://localhost:8005/mcp",
    json={"jsonrpc":"2.0","id":"v2","method":"tools/call",
          "params":{"name":"memory_health","arguments":{}}},
    headers=h2, timeout=15)
d2 = r2.json()
print(f"Full response keys: {list(d2.keys())}")
res = d2.get("result", {})
print(f"Result keys: {list(res.keys())}")
ct = res.get("content", [])
print(f"Content count: {len(ct)}")
for i, c in enumerate(ct):
    t = c.get("text", "")
    print(f"Item {i}: type={c.get('type')}, text_len={len(t)}, text_preview={t[:200]}")
