"""Test real embedding + search end-to-end."""

import os
import time

from bastion.embeddings import _embed_local

emb = _embed_local("Python is a programming language")
print(f"Embedding OK: len={len(emb)}, first_5={emb[:5]}")

from bastion.memory import BastionMemory

mem = BastionMemory("embed-test", connection_string=os.environ.get("BASTION_CONN", ""), mock=False)

try:
    for m in mem.list_all():
        mem.delete(m.memory_id)
except Exception:
    pass

mid1 = mem.store("fact", "Alice works on the CockroachDB database team in Bangalore", metadata={"test": "embed"})
print(f"Stored Alice: {mid1}")
mid2 = mem.store("fact", "Bob builds the React dashboard and loves dark mode", metadata={"test": "embed"})
print(f"Stored Bob: {mid2}")
mid3 = mem.store("fact", "Charlie manages AWS infrastructure and Kubernetes clusters", metadata={"test": "embed"})
print(f"Stored Charlie: {mid3}")

time.sleep(2)

for query, expected in [
    ("Who works with databases?", "Alice"),
    ("dark mode UI preferences", "Bob"),
    ("cloud infrastructure AWS", "Charlie"),
]:
    results = mem.search(query, k=3, threshold=0.0)
    print(f'\nQuery: "{query}"')
    for r in results:
        match = " [MATCH]" if expected.lower() in r.content.lower() else ""
        print(f'  {match} [{r.memory_id[:8]}] {r.content[:80]}')

mem.close()
