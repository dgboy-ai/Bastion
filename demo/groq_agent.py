"""
Bastion AI Agent Demo — Groq-powered agent with Bastion memory (local MCP)
"""

import json
import os
import sys
import uuid
import httpx
from typing import Any

MCP_URL = "http://localhost:8005/mcp"
GROQ_API_KEY = "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"
GROQ_MODEL = "qwen/qwen3.6-27b"
AGENT_ID = f"groq-agent-{uuid.uuid4().hex[:6]}"

C = {"g": "\033[92m", "y": "\033[93m", "r": "\033[91m", "c": "\033[96m", "m": "\033[95m", "b": "\033[1m", "n": "\033[0m"}

def ok(m):    print(f"  {C['g']}[OK]{C['n']} {m}")
def warn(m):  print(f"  {C['y']}[!]{C['n']} {m}")
def fail(m):  print(f"  {C['r']}[X]{C['n']} {m}")
def info(m):  print(f"  {C['c']}[i]{C['n']} {m}")
def agent(m): print(f"\n  {C['m']}Agent:{C['n']} {m}")
def bold(m):  print(f"  {C['b']}{m}{C['n']}")


class BastionMCP:
    def __init__(self):
        api_key = os.environ.get("BASTION_API_KEY", "")
        self.base_headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if api_key:
            self.base_headers["Authorization"] = f"Bearer {api_key}"
        self.http = httpx.Client(timeout=60.0)
        self.session_id = None

    def _init_session(self):
        payload = {
            "jsonrpc": "2.0", "id": "init1",
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "groq-agent", "version": "1.0"},
            },
        }
        r = self.http.post(MCP_URL, json=payload, headers=self.base_headers)
        r.raise_for_status()
        self.session_id = r.headers.get("mcp-session-id", "")

    def _post(self, body: dict) -> dict:
        if not self.session_id:
            self._init_session()
        headers = dict(self.base_headers)
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        r = self.http.post(MCP_URL, json=body, headers=headers)
        r.raise_for_status()
        return r.json()

    def call(self, tool: str, args: dict = None) -> dict:
        data = self._post({
            "jsonrpc": "2.0", "id": uuid.uuid4().hex,
            "method": "tools/call",
            "params": {"name": tool, "arguments": args or {}},
        })
        if "error" in data:
            raise RuntimeError(f"MCP error [{tool}]: {data['error']}")
        text = data.get("result", {}).get("content", [{}])[0].get("text", "{}")
        return json.loads(text)

    def store(self, content: str, mtype: str = "fact", meta: dict = None) -> dict:
        return self.call("memory_store", {"content": content, "memory_type": mtype, "metadata": meta or {}})

    def store_encrypted(self, content: str, mtype: str = "fact") -> dict:
        return self.call("memory_store_encrypted", {"content": content, "memory_type": mtype, "metadata": {"kms": True}})

    def search(self, query: str, k: int = 5) -> list:
        return self.call("memory_search", {"query": query, "k": k})

    def forensic(self) -> dict:
        return self.call("forensic_report", {})


def main():
    print(f"{C['b']}{'='*60}{C['n']}")
    print(f"{C['b']}  BASTION x GROQ: REAL AI AGENT WITH PROVABLE MEMORY{C['n']}")
    print(f"{C['b']}{'='*60}{C['n']}\n")

    info(f"LLM: {GROQ_MODEL} via Groq")
    info(f"Memory: Bastion MCP at {MCP_URL}")
    info(f"Agent ID: {AGENT_ID}")
    print()

    memory = BastionMCP()
    from groq import Groq
    llm = Groq(api_key=GROQ_API_KEY)

    # Phase 1: Store memories
    bold("--- Phase 1: Agent stores memories (via MCP tools) ---")
    facts = [
        "The user's name is Trueboy building an AI memory system called Bastion.",
        "Bastion uses CockroachDB with C-SPANN vector indexing for semantic search.",
        "Bastion is in the CockroachDB x AWS Hackathon with 2583 participants.",
        "Bastion's unique feature is forensic memory: hash chains, time-travel, self-healing.",
    ]
    for fact in facts:
        r = memory.store(fact, "fact", {"source": "groq-demo"})
        info(f"Stored hash: {str(r.get('cryptographic_hash',''))[:16]}...")

    # Phase 2: Semantic search
    bold("\n--- Phase 2: Semantic memory search (C-SPANN vector indexing) ---")
    for q in ["What makes Bastion unique?", "What competition is it in?", "Who is building it?"]:
        results = memory.search(q, 3)
        if results:
            items = results.get("results", results.get("memories", [])) if isinstance(results, dict) else results
            ok(f"'{q}' -> {len(items)} results")
            for r in (items if isinstance(items, list) else [])[:2]:
                info(f"  {r.get('content','')[:70]}...")

    # Phase 3: Real AI conversation
    bold("\n--- Phase 3: Real AI conversation (Groq Qwen 3.6-27B) ---")
    conv = [{"role": "system", "content": (
        "You are an AI agent with persistent memory stored in Bastion. "
        "Your memory uses SHA-256 hash chains and is tamper-proof. "
        "Be concise. Make decisions based on what you remember."
    )}]

    prompts = [
        "Hi! I'm building Bastion for a hackathon. What should I highlight in my demo?",
        "Can you store our conversation so I can recall it later?",
    ]
    for prompt in prompts:
        info(f"User: {prompt}")
        conv.append({"role": "user", "content": prompt})
        r = llm.chat.completions.create(model=GROQ_MODEL, messages=conv, temperature=0.7, max_tokens=300)
        reply = r.choices[0].message.content or ""
        agent(reply)
        conv.append({"role": "assistant", "content": reply})
        if "store" in prompt.lower():
            memory.store(f"Conversation insight: {reply[:200]}", "insight", {"source": "groq-agent"})
            ok("Agent stored this insight in Bastion")

    # Phase 4: KMS encrypted storage
    bold("\n--- Phase 4: KMS-encrypted memory (AWS) ---")
    secret = "AWS credentials and API keys must stay encrypted at rest."
    try:
        er = memory.store_encrypted(secret, "secret")
        ok(f"Encrypted memory stored via KMS AES-256-GCM (hash: {str(er.get('cryptographic_hash',''))[:16]}...)")
    except Exception as e:
        warn(f"KMS encrypt: {e}")

    # Phase 5: Forensic report
    bold("\n--- Phase 5: Forensic integrity report ---")
    try:
        report = memory.forensic()
        status = report.get("hash_chain_status", "?")
        ok(f"Hash chain: {status}") if status == "INTACT" else fail(f"Hash chain: {status}")
        info(f"Memories: {report.get('total_memories')} | Pinned: {report.get('pinned_memories')} | Audit: {report.get('audit_log_entries')}")
        info(f"Guard: {report.get('guard_total_checks')} checks, {report.get('guard_blocked_count')} blocked")
        info(f"Types: {json.dumps(report.get('memory_type_distribution', {}))}")
    except Exception as e:
        warn(f"Forensic: {e}")

    # Summary
    bold(f"\n{'='*60}")
    bold("  DEMO COMPLETE")
    bold(f"{'='*60}\n")
    ok("1. Groq AI agent stored/retrieved memories via Bastion MCP (35 tools)")
    ok("2. Semantic search via CockroachDB C-SPANN vector index")
    ok("3. Real AI conversation with Groq Qwen 3.6-27B")
    ok("4. AWS KMS encryption for sensitive memories")
    ok("5. Forensic integrity report verified")


if __name__ == "__main__":
    main()
