import httpx, json, os

API_KEY = os.environ.get("BASTION_API_KEY", "")
H = {"Content-Type": "application/json", "Accept": "application/json", "Authorization": f"Bearer {API_KEY}"}

print("=== MCP SERVER CHECK ===")
try:
    # Init
    r = httpx.post("http://localhost:8005/mcp",
        json={"jsonrpc":"2.0","id":"init","method":"initialize",
              "params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}},
        headers=H, timeout=15)
    print(f"Status: {r.status_code}")
    sid = r.headers.get("mcp-session-id", "")
    print(f"Session-ID: {sid[:20] if sid else 'NONE'}")
    
    if sid:
        h2 = {**H, "Mcp-Session-Id": sid}
        r2 = httpx.post("http://localhost:8005/mcp",
            json={"jsonrpc":"2.0","id":"v2","method":"tools/call",
                  "params":{"name":"memory_health","arguments":{}}},
            headers=h2, timeout=15)
        d2 = r2.json()
        txt = d2.get("result",{}).get("content",[{}])[0].get("text","{}")
        if txt.startswith("{"):
            health = json.loads(txt)
            print(f"Health: {health.get('total_memories','?')} memories, {health.get('pinned_memories','?')} pinned")
        else:
            print(f"Raw response: {str(d2)[:200]}")
    else:
        print(f"Init response: {json.dumps(r.json(), indent=2)[:500]}")
except Exception as e:
    print(f"MCP ERROR: {e}")

print("\n=== A2A SERVER CHECK ===")
try:
    r = httpx.get("http://localhost:9998/.well-known/agent-card.json", headers=H, timeout=15)
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        d = r.json()
        skills = d.get("skills", [])
        print(f"Skills: {len(skills)}")
    else:
        print(f"Body: {r.text[:500]}")
except Exception as e:
    print(f"A2A ERROR: {e}")
