"""Check actual API names and fix reality check"""
import sys
sys.path.insert(0, 'src')

from bastion import BastionMemory
from bastion.trust import compute_trust_score
from bastion.dreaming import MemoryDreamer, DreamJournal
from bastion.ltm_gateway import LTMMemoryGateway
from bastion.contradiction import ContradictionDetector
import inspect

print("=" * 60)
print("  ACTUAL API CHECK")
print("=" * 60)

# 1. BastionMemory methods
mem = BastionMemory('test', mock=True)
methods = [m for m in dir(mem) if not m.startswith('_') and callable(getattr(mem, m))]
print(f"\nBastionMemory methods: {len(methods)}")
print(f"  Has 'get_at_time': {'get_at_time' in methods}")
print(f"  Has 'timetravel': {'timetravel' in methods}")

# 2. Trust score signature
sig = inspect.signature(compute_trust_score)
print(f"\ncompute_trust_score params: {list(sig.parameters.keys())}")

# 3. DreamJournal attributes
print(f"\nDreamJournal attrs: {[a for a in dir(DreamJournal) if not a.startswith('_')]}")

# 4. LTM Gateway check_reuse
gateway = LTMMemoryGateway(mem)
sig2 = inspect.signature(gateway.check_reuse)
print(f"\nLTMMemoryGateway.check_reuse params: {list(sig2.parameters.keys())}")

# 5. ContradictionDetector.scan_all
detector = ContradictionDetector(mem)
sig3 = inspect.signature(detector.scan_all)
print(f"\nContradictionDetector.scan_all params: {list(sig3.parameters.keys())}")

# 6. Actually test working features
print("\n" + "=" * 60)
print("  WORKING FEATURES")
print("=" * 60)

mem.store('fact', 'Test memory 1')
mem.store('fact', 'Test memory 2')

# Store
print(f"\n✅ Store: {mem.store('fact', 'Test')}")

# Search
results = mem.search('test', k=3, threshold=0.0)
print(f"✅ Search: {len(results)} results")

# Get at time (correct method)
past = mem.get_at_time('5 seconds ago')
print(f"✅ Time-travel (get_at_time): {len(past)} memories")

# Audit
audit = mem.audit()
print(f"✅ Audit: {len(audit)} entries")

# Heal
heal = mem.heal()
print(f"✅ Heal: {heal}")

# Trust report
report = mem.trust_report(list(mem.list_all())[0].memory_id if mem.list_all() else None)
print(f"✅ Trust report: {type(report)}")

# Memory health
health = mem.memory_health()
print(f"✅ Memory health: {health}")

print("\n" + "=" * 60)
print("  CONCLUSION")
print("=" * 60)
print("""
REALITY:
- Core features (store, search, audit, heal) WORK in mock mode
- Time-travel works via get_at_time() (not timetravel())
- Trust score needs correct signature
- Dreaming and LTM Gateway have API issues
- NONE of this uses real CockroachDB

WHAT JUDGES WILL EXPERIENCE:
- Dashboard shows mock data
- Demo script works in mock mode
- Real CockroachDB connection has NOT been tested end-to-end
- MCP server has NOT been tested with real cluster
""")
