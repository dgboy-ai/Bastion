import sys
sys.path.insert(0, "src")
from bastion.dba import AutonomousDBA
print("1E imports OK")

from bastion import AutonomousDBA
print("1E exports from __init__ OK")

dba = AutonomousDBA(cluster_id="test-cluster", threshold_ms=150)
print(f"1E DBA created: threshold={dba.threshold_ms}ms, auto_scale={dba.auto_scale}")
