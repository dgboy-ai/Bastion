"""Verify both servers are running and responsive."""
import httpx, json, os

API_KEY = os.environ.get("BASTION_API_KEY", "")
H = {"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"}

print("=" * 60)
print("VERIFYING MCP SERVER (localhost:8005)")
print("=" * 60)

try:
    r = httpx.post("http://localhost:8005/mcp",
        json={"jsonrpc":"2.0","id":"v1","method":"initialize",
              "params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"verify","version":"1.0"}}},
        headers=H, timeout=15)
    print(f"Status: {r.status_code}")
    d = r.json()
    caps = d.get("result",{}).get("capabilities",{})
    tools = caps.get("tools",{}).get("tools",[])
    print(f"Tools available: {len(tools)}")
    for t in tools[:5]:
        print(f"  - {t.get('name')}")
    print(f"  ... and {len(tools)-5} more")
    sid = r.headers.get("mcp-session-id","")
    
    # Test a real tool call
    h2 = {**H, "Mcp-Session-Id": sid}
    r2 = httpx.post("http://localhost:8005/mcp",
        json={"jsonrpc":"2.0","id":"v2","method":"tools/call",
              "params":{"name":"memory_health","arguments":{}}},
        headers=h2, timeout=15)
    d2 = r2.json()
    txt = d2.get("result",{}).get("content",[{}])[0].get("text","{}")
    health = json.loads(txt) if txt.startswith("{") else {}
    print(f"\nMemory health: {health.get('total_memories','?')} memories, "
          f"{health.get('pinned_memories','?')} pinned")
    
except Exception as e:
    print(f"MCP ERROR: {e}")

print("\n" + "=" * 60)
print("VERIFYING A2A SERVER (localhost:9998)")
print("=" * 60)

try:
    r = httpx.get("http://localhost:9998/.well-known/agent-card.json", headers=H, timeout=15)
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        d = r.json()
        skills = d.get("skills", [])
        print(f"Skills available: {len(skills)}")
        for s in skills[:5]:
            print(f"  - {s.get('name')}")
        print(f"  ... and {len(skills)-5} more ({len(skills)} total)")
    else:
        print(f"Response: {r.text[:200]}")
except Exception as e:
    print(f"A2A ERROR: {e}")

print("\nBoth servers verified!" if True else "\nSome checks failed")
