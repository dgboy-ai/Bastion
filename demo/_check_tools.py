import os, json, httpx
k = os.environ.get("BASTION_API_KEY", "")
h = {"Content-Type":"application/json","Accept":"application/json","Authorization":f"Bearer {k}"}

r = httpx.post("http://localhost:8005/mcp", json={"jsonrpc":"2.0","id":"1","method":"initialize","params":{}}, headers=h, timeout=30)
print("Init:", r.status_code, json.dumps(r.json(), indent=2)[:200] if r.headers.get("content-type","").startswith("application/json") else r.text[:200])
