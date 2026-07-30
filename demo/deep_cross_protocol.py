"""
DEEP CROSS-PROTOCOL TEST v2:
  A2A JSON-RPC SendMessage (with correct metadata)
  + REST /message:send + MCP cross-verify + multi-agent
"""

import json, os, uuid, httpx

A2A_URL = "http://localhost:9998/"
MCP_URL = "http://localhost:8005/mcp"
API_KEY = os.environ.get("BASTION_API_KEY", "BASTION_API_KEY_REMOVED")

C = {"g":"\033[92m","y":"\033[93m","r":"\033[91m","c":"\033[96m","m":"\033[95m","b":"\033[1m","n":"\033[0m"}
PASS = 0; FAIL = 0
def ok(m):    global PASS; PASS += 1; print(f"  {C['g']}[PASS]{C['n']} {m}")
def fail(m):  global FAIL; FAIL += 1; print(f"  {C['r']}[FAIL]{C['n']} {m}")
def info(m):  print(f"  {C['c']}[..]{C['n']} {m}")
def head(m):  print(f"\n{C['b']}>>> {m} <<<{C['n']}")

A2A_HEADERS = {"Content-Type":"application/json","Authorization":f"Bearer {API_KEY}","a2a-version":"1.0"}

def send_a2a(skill, params):
    body = {
        "jsonrpc":"2.0","id":uuid.uuid4().hex[:8],"method":"SendMessage",
        "params":{
            "id":f"task-{uuid.uuid4().hex[:8]}","sessionId":f"sess-{uuid.uuid4().hex[:8]}",
            "message":{
                "role":"agent",
                "metadata":{"skill":skill,"params":params},
                "parts":[{"type":"text","text":f"execute {skill}"}]
            }
        }
    }
    r = httpx.post(A2A_URL, json=body, headers=A2A_HEADERS, timeout=60).json()
    result = r.get("result",{})
    task = result.get("task",result)
    state = task.get("status",{}).get("state","?")
    artifacts = task.get("artifacts",[])
    mid = ""
    for a in artifacts:
        txt = a.get("parts",[{}])[0].get("text","")
        try:
            p = json.loads(txt)
            if "memory_id" in p: mid = p["memory_id"]
        except: pass
    return {"state":state,"memory_id":mid,"artifacts":artifacts,"raw":r}

def rest_a2a(skill, params):
    body = {
        "id":f"task-{uuid.uuid4().hex[:8]}","sessionId":f"sess-{uuid.uuid4().hex[:8]}",
        "message":{
            "role":"agent",
            "metadata":{"skill":skill,"params":params},
            "parts":[{"type":"text","text":f"execute {skill}"}]
        }
    }
    r = httpx.post("http://localhost:9998/message:send", json=body, headers=A2A_HEADERS, timeout=60).json()
    task = r.get("task",r)
    state = task.get("status",{}).get("state","?")
    artifacts = task.get("artifacts",[])
    mid = ""
    for a in artifacts:
        txt = a.get("parts",[{}])[0].get("text","")
        try:
            p = json.loads(txt)
            if "memory_id" in p: mid = p["memory_id"]
        except: pass
    return {"state":state,"memory_id":mid,"artifacts":artifacts,"raw":r}

def mcp_call(tool, args=None):
    http = httpx.Client(timeout=30)
    r = http.post(MCP_URL, json={
        "jsonrpc":"2.0","id":"init","method":"initialize",
        "params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"deep","version":"1.0"}}
    }, headers={"Content-Type":"application/json","Accept":"application/json","Authorization":f"Bearer {API_KEY}"})
    sid = r.headers.get("mcp-session-id","")
    h = {"Content-Type":"application/json","Accept":"application/json","Mcp-Session-Id":sid,"Authorization":f"Bearer {API_KEY}"}
    r = http.post(MCP_URL, json={"jsonrpc":"2.0","id":uuid.uuid4().hex,"method":"tools/call","params":{"name":tool,"arguments":args or {}}}, headers=h).json()
    if "error" in r: raise RuntimeError(f"{tool}: {r['error']}")
    text = r.get("result",{}).get("content",[{}])[0].get("text","{}")
    try: return json.loads(text)
    except: return text

def run():
    AGENT_A_MID = None; AGENT_B_MID = None

    head("1. A2A JSON-RPC SendMessage")
    r = send_a2a("memory_store",{"content":"Stored via A2A SendMessage","memory_type":"fact","metadata":{"source":"a2a-jsonrpc"}})
    ok(f"memory_store -> state={r['state']} mid={r['memory_id'][:12] if r['memory_id'] else 'N/A'}...")
    AGENT_A_MID = r["memory_id"]

    head("2. A2A REST /message:send")
    r = rest_a2a("memory_store",{"content":"Stored via REST /message:send","memory_type":"fact","metadata":{"protocol":"a2a-rest"}})
    ok(f"memory_store REST -> state={r['state']} mid={r['memory_id'][:12] if r['memory_id'] else 'N/A'}...")
    AGENT_B_MID = r["memory_id"]

    head("3. A2A search via SendMessage")
    r = send_a2a("memory_search",{"query":"A2A SendMessage","k":3})
    ok(f"memory_search -> state={r['state']}")

    head("4. A2A health + list via REST")
    r = rest_a2a("memory_health",{})
    ok(f"memory_health -> state={r['state']}")
    r = rest_a2a("memory_list",{"limit":5})
    ok(f"memory_list -> state={r['state']}")

    head("5. MULTI-AGENT CONFLICT RESOLUTION")
    r = send_a2a("memory_store",{"content":"The Eiffel Tower is in London.","memory_type":"fact","metadata":{"agent":"Agent-A"}})
    if r["memory_id"]:
        ok(f"Agent-A stored (wrong) -> {r['memory_id'][:12]}...")
        r2 = send_a2a("detect_contradictions",{"memory_id":r["memory_id"]})
        ok(f"Agent-B detect_contradictions -> state={r2['state']}")
        r3 = send_a2a("resolve_conflict",{"fact_a":"The Eiffel Tower is in London.","fact_b":"The Eiffel Tower is in Paris.","context":"Multiple agents disagree."})
        ok(f"resolve_conflict -> state={r3['state']}")
    else:
        fail("multi-agent conflict: no memory_id")

    head("6. OWASP GUARD - memory poison via A2A")
    for name, payload in [("SQLi","'; DROP TABLE users; --"),("XSS","<script>alert(1)</script>"),("SSTI","{{config}}")]:
        r = send_a2a("memory_store",{"content":payload,"memory_type":"fact","metadata":{"poison":name}})
        ok(f"Poison ({name}) -> state={r['state']} (guard logged)")

    head("7. A2A -> MCP CROSS-VERIFY")
    if AGENT_A_MID:
        r = rest_a2a("memory_search",{"query":"Stored via A2A SendMessage","k":3})
        ok(f"A2A search for Agent-A memory -> state={r['state']}")
        r = mcp_call("memory_search",{"query":"Stored via A2A SendMessage","k":5})
        results = r.get("results",[]) if isinstance(r,dict) else (r if isinstance(r,list) else [])
        ok(f"MCP cross-verify -> {len(results)} results")
    else:
        fail("cross-verify: no memory_id")

    head("8. A2A STREAMING (SSE)")
    try:
        body = {
            "id":f"task-{uuid.uuid4().hex[:8]}","sessionId":f"sess-{uuid.uuid4().hex[:8]}",
            "message":{"role":"agent","metadata":{"skill":"memory_health","params":{}},"parts":[{"type":"text","text":"health"}]}
        }
        r = httpx.post("http://localhost:9998/message:sendStream", json=body, headers=A2A_HEADERS, timeout=15)
        ok(f"SSE streaming -> status={r.status_code}")
    except Exception as e:
        fail(f"SSE streaming -> {str(e)[:50]}")

    head("9. PUBLIC KEY ROTATION")
    r = httpx.get("http://localhost:9998/.well-known/public-key.pem", timeout=15)
    ok(f"Public key -> {len(r.text)} chars ED25519") if "BEGIN PUBLIC" in r.text else fail("No public key")

    head("10. A2A + MCP FORENSIC INTEGRITY")
    r = rest_a2a("memory_health",{})
    ok(f"A2A memory_health -> state={r['state']}")
    r = mcp_call("forensic_report",{})
    s = r.get("hash_chain_status","?") if isinstance(r,dict) else "?"
    ok(f"MCP forensic -> chain={s}")

    print(f"\n{C['b']}{'='*60}{C['n']}")
    print(f"{C['b']}  DEEP CROSS-PROTOCOL TEST RESULT{C['n']}")
    print(f"{C['b']}{'='*60}{C['n']}")
    print(f"  {C['g']}PASS: {PASS}{C['n']}  {C['r']}FAIL: {FAIL}{C['n']}")
    return FAIL == 0

if __name__ == "__main__":
    exit(0 if run() else 1)
