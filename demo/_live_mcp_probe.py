"""Live official CRDB Cloud MCP + ccloud probe. Calls through Bastion proxy so dashboard logs it."""
import json, os, sys, time, uuid, httpx
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

MCP_URL = "http://localhost:8005/mcp"
API_KEY = os.environ.get("BASTION_API_KEY", "")

class MCPClient:
    def __init__(self):
        self.http = httpx.Client(timeout=120)
        self.sid = None
    def call(self, tool, args=None):
        if not self.sid:
            r = self.http.post(MCP_URL, json={"jsonrpc":"2.0","id":"init","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"mcp-live-probe","version":"1.0"}}}, headers={"Content-Type":"application/json","Accept":"application/json","Authorization":f"Bearer {API_KEY}"})
            self.sid = r.headers.get("mcp-session-id","")
        h = {"Content-Type":"application/json","Accept":"application/json","Mcp-Session-Id":self.sid,"Authorization":f"Bearer {API_KEY}"}
        r = self.http.post(MCP_URL, json={"jsonrpc":"2.0","id":uuid.uuid4().hex,"method":"tools/call","params":{"name":tool,"arguments":args or {}}}, headers=h, timeout=120)
        d = r.json()
        if "error" in d:
            raise RuntimeError(f"{tool}: {d['error']}")
        t = d.get("result",{}).get("content",[{}])[0].get("text","{}")
        try: return json.loads(t)
        except: return t

mcp = MCPClient()

print("=== Official CRDB Cloud Managed MCP (via Bastion proxy) ===")
r = mcp.call("managed_mcp_call", {"tool":"list_clusters","params":{}})
print("list_clusters:", json.dumps(r, indent=2)[:600])

r = mcp.call("managed_mcp_call", {"tool":"list_databases","params":{}})
print("\nlist_databases:", json.dumps(r, indent=2)[:600])

r = mcp.call("managed_mcp_call", {"tool":"select_query","params":{"database":"defaultdb","query":"SELECT current_timestamp AS ts, version() AS ver"}})
print("\nselect_query:", json.dumps(r, indent=2)[:600])

print("\n=== ccloud CLI ===")
r = mcp.call("ccloud_exec", {"command":"cluster","args":["list"]})
print("ccloud cluster list:", json.dumps(r, indent=2)[:600])

print("\nDone. Refresh dashboard TOOL ACTIVITY to see these calls.")
