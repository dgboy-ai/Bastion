"""Real CRDB Integration Test — proves the code works against live CockroachDB."""

CONN = "postgresql://divyansh:7_GfcNnRnL6UaflljIzOIw@bastion-memory-28736.j77.aws-ap-south-1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full"

from datetime import UTC, datetime, timedelta
from bastion.memory import BastionMemory, MemoryRouter
from bastion.agent import BastionAgent
from bastion.thought_chain import ThoughtChain
from bastion.rules import CognitiveRulesEngine, ExecutionLog, RuleCategory
from bastion.locality import MemoryLocality
from bastion.dba import SchemaEvolution

passed = 0
failed = 0

def check(label, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  [PASS] {label}")
        passed += 1
    else:
        print(f"  [FAIL] {label} {detail}")
        failed += 1

print("=== REAL COCKROACHDB INTEGRATION TEST ===\n")

# 1. Connect
try:
    mem = BastionMemory("integration-test-agent", connection_string=CONN, mock=False)
    check("Connect to live CockroachDB", True)
except Exception as e:
    check("Connect to live CockroachDB", False, str(e))
    print("\nCannot proceed without DB connection.")
    exit(1)

# 2. Store memories with hash chain
print("\n--- Hash Chain Integrity ---")
r1 = mem.store("fact", "User prefers Python over TypeScript", {"domain": "programming"})
check("Store memory 1", r1.memory_id is not None and r1.cryptographic_hash is not None)

r2 = mem.store("fact", "User works on Bastion project", {"domain": "project"})
check("Store memory 2", r2.memory_id is not None)
check("Chain link 1->2", r2.previous_hash == r1.cryptographic_hash,
      f"got prev={r2.previous_hash[:16] if r2.previous_hash else 'None'} expected={r1.cryptographic_hash[:16]}")

r3 = mem.store("instruction", "Always verify signatures before accepting messages", {"domain": "security"})
check("Store memory 3", r3.memory_id is not None)
check("Chain link 2->3", r3.previous_hash == r2.cryptographic_hash)

# 3. Search (vector similarity)
print("\n--- Vector Search ---")
results = mem.search("User prefers Python", k=3, threshold=0.0)
check("Search returns results", len(results) > 0, f"got {len(results)}")
if results:
    check("Search finds relevant content", any("Python" in r.content for r in results))

# 4. Audit log
print("\n--- Audit Trail ---")
entries = mem.audit("integration-test-agent")
check("Audit log has entries", len(entries) >= 3, f"got {len(entries)}")
check("Audit entries have correct action", any(e.action == "memory_store" for e in entries))

# 5. Full chain verification
print("\n--- Full Chain Verification ---")
records = mem.list_all()
check("list_all returns memories", len(records) >= 3, f"got {len(records)}")
records.sort(key=lambda r: r.created_at)
chain_valid = True
for i in range(1, len(records)):
    if records[i].previous_hash != records[i-1].cryptographic_hash:
        chain_valid = False
        check(f"Chain link {i-1}->{i}", False,
              f"expected {records[i-1].cryptographic_hash[:16]} got {records[i].previous_hash[:16] if records[i].previous_hash else 'None'}")
        break
if chain_valid and len(records) >= 3:
    check("Full hash chain intact", True)

# 6. Time travel
print("\n--- Time Travel (AS OF SYSTEM TIME) ---")
past = (datetime.now(UTC) - timedelta(minutes=5)).isoformat()
past_memories = mem.get_at_time(timestamp=past, agent_id="integration-test-agent")
check("Time travel query works", isinstance(past_memories, list))

# 7. Memory reinforce
print("\n--- Memory Operations ---")
recent = mem.list_all()
if recent:
    mid = recent[0].memory_id
    reinforced = mem.reinforce(mid, success=True)
    check("Reinforce memory", reinforced.get("status") == "reinforced")

# 8. Heal
print("\n--- Self-Healing ---")
heal_result = mem.heal("integration-test-agent")
check("Heal operation completes", "status" in heal_result and heal_result["status"] == "healed")

# 9. A2A task store
print("\n--- A2A Task Store (DB-backed) ---")
import uuid
task_id = str(uuid.uuid4())
task = mem.store_a2a_task(task_id, "integration-test-agent", "memory_store", "WORKING")
check("Store A2A task", task.get("task_id") == task_id)

retrieved = mem.get_a2a_task(task_id)
check("Retrieve A2A task", retrieved is not None and retrieved.get("status") == "WORKING")

updated = mem.update_a2a_task(task_id, "COMPLETED", [{"parts": [{"text": "done"}]}])
check("Update A2A task to COMPLETED", updated is not None and updated.get("status") == "COMPLETED")
check("Task has completed_at", updated.get("completed_at") is not None)

# 10. MemoryRouter (Claim 13)
print("\n--- MemoryRouter (Dynamic Routing) ---")
router = MemoryRouter(mem, cache_size=10, promotion_threshold=2)
r = router.search("Python", k=2, threshold=0.0)
check("Router search returns results", len(r) > 0)
s = router.get_stats()
check("Router has stats", "cache_size" in s and "hit_rate_percent" in s)

# 11. Virtual Actor Paging (Claim 14)
print("\n--- Virtual Actor Paging ---")
agent = BastionAgent("paging-test", connection_string=CONN, mock=False)
agent.memory.store("fact", "test memory")
agent._conversation_history = [{"role": "user", "content": "hello"}]
dehydrated = agent.dehydrate()
check("Dehydrate saves conversation", dehydrated["conversation_turns_saved"] == 1)
check("Dehydrate clears local state", len(agent._conversation_history) == 0)

rehydrated = agent.rehydrate(dehydrated["page_id"])
check("Rehydrate restores conversation", rehydrated["conversation_turns_restored"] == 1)
check("Rehydrate restores history", len(agent._conversation_history) == 1)

pages = agent.list_pages()
check("List pages returns page", len(pages) >= 1)
agent.close()

# 12. RLS (Claim 15)
print("\n--- Row-Level Security ---")
mem.enable_rls()
check("RLS enabled", mem._rls_enabled)

# 13. Thought-Chain Logging (Claim 17)
print("\n--- Thought-Chain Graph Logging ---")
chain = ThoughtChain(mem, agent_id="integration-test-agent")
root = chain.begin("Analyze user request")
t1 = chain.think("User wants database optimization", parent_id=root)
d1 = chain.decide("Add index on created_at", parent_id=t1)
chain.complete("Index added successfully", parent_id=d1)
graph = chain.get_graph(root)
check("Thought chain has nodes", graph["total_nodes"] >= 3)
check("Thought chain has edges", graph["total_edges"] >= 2)

# 14. Cognitive Rules Engine (Claim 18)
print("\n--- Cognitive Rules Engine ---")
engine = CognitiveRulesEngine(mem)
log = ExecutionLog(agent_id="integration-test-agent", action="memory_search", outcome="failure", error_message="timeout")
engine.ingest_execution_log(log)
engine.ingest_execution_log(log)
rules = engine.get_active_rules()
check("Rules engine creates rules", len(rules) >= 1)
check("Rules engine tracks fire count", rules[0].fire_count >= 2)

# 15. Schema Evolution (Claim 21)
print("\n--- Schema Evolution ---")
se = SchemaEvolution()
validation = se.validate_proposal("agent_memory", "test_column", "TEXT")
check("Schema validation works", validation["valid"] is True)

invalid = se.validate_proposal("agent_memory", "test", "INVALID_TYPE")
check("Schema validation rejects bad types", invalid["valid"] is False)

# 16. Multi-Region Locality (Claim 16)
print("\n--- Multi-Region Locality ---")
from bastion.locality import MemoryLocality
loc = MemoryLocality(mem)
loc.enable_regional_routing()
loc.set_agent_region("integration-test-agent", "eu-west-1")
check("Region routing enabled", loc.get_routing_stats()["routing_enabled"])
compliance = loc.validate_compliance("integration-test-agent", "GDPR")
check("GDPR compliance validated", compliance["compliant"])

# Cleanup
mem.close()

# Summary
print(f"\n{'='*50}")
print(f"Results: {passed} passed, {failed} failed")
print(f"{'='*50}")
exit(1 if failed else 0)
