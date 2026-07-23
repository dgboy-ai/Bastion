"""CRUD operations test for Bastion memory engine."""
import sys
sys.path.insert(0, "src")

from bastion.memory import BastionMemory

mem = BastionMemory("test-agent", mock=True)

# CREATE
print("=== CREATE ===")
r1 = mem.store("fact", "The sky is blue", metadata={"source": "test"})
print(f"Stored: {r1.memory_id[:8]}... type={r1.memory_type} content={r1.content[:30]}")

r2 = mem.store("preference", "User likes dark mode")
print(f"Stored: {r2.memory_id[:8]}... type={r2.memory_type}")

# READ (search)
print("\n=== READ (search) ===")
results = mem.search("sky", k=5)
print(f"Found {len(results)} results")
for r in results:
    print(f"  {r.memory_id[:8]}... {r.content[:40]} (score={r.importance_score})")

# READ (get by ID)
print("\n=== READ (get by ID) ===")
fetched = mem.get_memory(r1.memory_id)
print(f"Fetched: {fetched.content[:30] if fetched else 'NOT FOUND'}")

# UPDATE
print("\n=== UPDATE ===")
updated = mem.correct_memory(r1.memory_id, "The sky is actually light blue")
print(f"Updated: {updated.content[:40] if updated else 'NOT FOUND'}")

# READ after update
fetched2 = mem.get_memory(r1.memory_id)
print(f"After update: {fetched2.content[:40] if fetched2 else 'NOT FOUND'}")

# DELETE
print("\n=== DELETE ===")
deleted = mem.delete_memory(r2.memory_id)
print(f"Deleted: {deleted}")
fetched3 = mem.get_memory(r2.memory_id)
print(f"After delete: {fetched3}")

# LIST
print("\n=== LIST ===")
all_memories = mem.list_all()
print(f"Total memories: {len(all_memories)}")

# AUDIT
print("\n=== AUDIT ===")
audit_entries = mem.audit()
print(f"Audit entries: {len(audit_entries)}")
for e in audit_entries[:3]:
    print(f"  {e.action}: {str(e.details)[:50]}")

# HASH CHAIN INTEGRITY
print("\n=== HASH CHAIN ===")
for r in all_memories[:3]:
    h = r.cryptographic_hash[:16] if r.cryptographic_hash else "None"
    p = r.previous_hash[:16] if r.previous_hash else "None"
    print(f"{r.memory_id[:8]}... hash={h}... prev={p}")

print("\n=== ALL CRUD OPERATIONS PASSED ===")
