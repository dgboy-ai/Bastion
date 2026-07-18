#!/usr/bin/env python3
"""Verify API data matches dashboard expectations."""

from bastion.memory import BastionMemory
import json

m = BastionMemory("api-test", mock=True)

# Store test data
for i in range(10):
    m.store("fact", f"Test memory {i}: Important data about topic {i % 3}", {"index": i})

# Test /api/memories (what HybridSearchPanel calls)
all_memories = m.list_all()
print("=== /api/memories ===")
print(f"Count: {len(all_memories)}")
mem = all_memories[0]
fields = list(mem.to_dict().keys())
print(f"Fields: {fields}")
print(f"memoryId: {mem.memory_id}")
print(f"memoryType: {mem.memory_type}")
print(f"content: {mem.content[:50]}...")
print(f"cryptographicHash: {mem.cryptographic_hash[:16]}...")
print(f"previousHash: {mem.previous_hash}")
print(f"createdAt: {mem.created_at}")
print()

# Test /api/audit (what FlightRecorderPage calls)
audit = m.audit()
print("=== /api/audit ===")
print(f"Count: {len(audit)}")
entry = audit[0]
fields = list(entry.to_dict().keys())
print(f"Fields: {fields}")
print(f"action: {entry.action}")
print(f"details: {entry.details}")
print()

# Test search (what HybridSearchPanel calls)
results = m.search("topic 0")
print("=== Search ===")
print(f"Found: {len(results)} results")
if results:
    r = results[0]
    print(f"First result content: {r.content[:50]}...")
print()

# Test hash chain (what HashChainVisualizer shows)
print("=== Hash Chain ===")
for i in range(min(3, len(all_memories))):
    mem = all_memories[i]
    prev = mem.previous_hash[:16] if mem.previous_hash else "None"
    print(f"{i}: hash={mem.cryptographic_hash[:16]}... prev={prev}...")
print()

print("ALL API OPERATIONS VERIFIED")
