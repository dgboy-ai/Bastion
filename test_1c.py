import sys
sys.path.insert(0, "src")
from bastion.compliance import ComplianceMode, ComplianceReporter, IETFAATRecord, VerifiableUnlearning
print("1C imports OK")

from bastion import ComplianceMode, ComplianceReporter, IETFAATRecord, VerifiableUnlearning
print("1C exports from __init__ OK")
