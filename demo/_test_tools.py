import httpx, json, os

API_KEY = os.environ.get("BASTION_API_KEY", "")
H = {"Content-Type": "application/json", "Accept": "application/json", "Authorization": f"Bearer {API_KEY}"}

# Init
r = httpx.post("http://localhost:8005/mcp",
    json={"jsonrpc":"2.0","id":"init","method":"initialize",
          "params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}},
    headers=H, timeout=15)
sid = r.headers.get("mcp-session-id", "")
print(f"SID: {sid[:20]}...")

h2 = {**H, "Mcp-Session-Id": sid}

# Test each tool
tools_to_test = [
    "forensic_report",
    "memory_list",
    "memory_get_pinned",
    "ltm_check_reuse",
    "ccloud_exec",
    "list_agent_skills",
]

for tool in tools_to_test:
    try:
        args = {}
        if tool == "ccloud_exec":
            args = {"command": "cluster", "args": ["list"]}
        if tool == "ltm_check_reuse":
            args = {"query": "test", "threshold": 0.5}
        
        r2 = httpx.post("http://localhost:8005/mcp",
            json={"jsonrpc":"2.0","id":tool,"method":"tools/call",
                  "params":{"name":tool,"arguments":args}},
            headers=h2, timeout=30)
        d2 = r2.json()
        err = d2.get("error")
        if err:
            print(f"[FAIL] {tool}: {err.get('message','?')[:100]}")
        else:
            ct = d2.get("result",{}).get("content",[{}])[0].get("text","")
            print(f"[OK]   {tool}: {ct[:80]}...")
    except Exception as e:
        print(f"[ERR]  {tool}: {e}")
