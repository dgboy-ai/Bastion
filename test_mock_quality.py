import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))
os.environ["BASTION_MOCK"] = "true"

from bastion import BastionMemory

m = BastionMemory("test", mock=True)
m.store("fact", "User likes Python for backend")
m.store("fact", "User prefers dark mode UI")
m.store("fact", "Deployment deadline is Friday")
m.store("fact", "Using CockroachDB for database")

# Test 1: Does mock search return different results for different queries?
r1 = m.search("Python programming", k=3)
r2 = m.search("UI design preferences", k=3)
r3 = m.search("when is the deadline", k=3)

print("=== MOCK SEARCH QUALITY TEST ===")
print("\nQuery: 'Python programming'")
for i, r in enumerate(r1):
    print(f"  {i+1}. [{r.memory_type}] {r.content}")

print("\nQuery: 'UI design preferences'")
for i, r in enumerate(r2):
    print(f"  {i+1}. [{r.memory_type}] {r.content}")

print("\nQuery: 'when is the deadline'")
for i, r in enumerate(r3):
    print(f"  {i+1}. [{r.memory_type}] {r.content}")

# Test 2: Does the full demo actually produce correct output?
print("\n=== FULL DEMO OUTPUT QUALITY ===")
print("The mock search returns ALL records ranked by importance_score,")
print("NOT by semantic similarity. This means the demo output is misleading.")
print("In live CockroachDB mode, C-SPANN provides real vector similarity.")
