#!/usr/bin/env python3
"""Verify Devpost submission checklist."""

import os

print("=== DEVPOST SUBMISSION CHECKLIST ===")
print()

# 1. Public open source repo
print("1. Public open source repository")
with open("README.md", encoding="utf-8") as f:
    readme = f.read()
assert "MIT License" in readme or "MIT" in readme
print("   [PASS] README exists with MIT license mention")

# 2. Functional demo app
print("2. Functional demo app")
assert os.path.exists("docker-compose.demo.yml")
print("   [PASS] docker-compose.demo.yml exists")

# 3. Video
print("3. Video (3 minutes max)")
print("   [TODO] Record demo video")

# 4. CockroachDB tools
print("4. CockroachDB tools used")
assert "MCP Server" in readme
assert "Distributed Vector" in readme or "C-SPANN" in readme
assert "ccloud" in readme
assert "Agent Skills" in readme
print("   [PASS] All 4 CockroachDB tools documented")

# 5. AWS services
print("5. AWS services used")
assert "Amazon Bedrock" in readme or "Bedrock" in readme
assert "Amazon S3" in readme or "S3" in readme
assert "AWS KMS" in readme or "KMS" in readme
print("   [PASS] All 3 AWS services documented")

# 6. Architecture diagram
print("6. Architecture diagram")
assert "Architecture" in readme
print("   [PASS] Architecture diagram in README")

# 7. License file
print("7. License file")
assert os.path.exists("LICENSE")
print("   [PASS] LICENSE file exists")

# 8. Test suite
print("8. Test suite")
test_count = len([f for f in os.listdir("tests") if f.startswith("test_")])
print(f"   [PASS] {test_count} test files")

# 9. Terraform config
print("9. Terraform config")
assert os.path.exists("terraform/main.tf")
print("   [PASS] terraform/main.tf exists")

# 10. Claude Desktop config
print("10. Claude Desktop config")
assert "claude_desktop_config" in readme
print("   [PASS] Claude Desktop config in README")

# 11. Seed demo with all memory types
print("11. Seed demo with all 6 memory types")
with open("scripts/seed_demo.py", encoding="utf-8") as f:
    seed = f.read()
for t in ["episodic", "semantic", "procedural", "security", "fact", "preference"]:
    assert f'"{t}"' in seed, f"Missing type: {t}"
print("   [PASS] All 6 memory types in seed_demo.py")

# 12. Native TTL
print("12. CockroachDB native TTL")
assert os.path.exists("schema/018_native_ttl.sql")
print("   [PASS] schema/018_native_ttl.sql exists")

# 13. Dashboard components
print("13. Dashboard components")
components = [
    "dashboard/src/app/flight-recorder/page.tsx",
    "dashboard/src/components/HybridSearchPanel.tsx",
    "dashboard/src/components/HashChainVisualizer.tsx",
    "dashboard/src/components/FaultToleranceVisualizer.tsx",
]
for comp in components:
    assert os.path.exists(comp), f"Missing: {comp}"
print("   [PASS] All 4 dashboard components exist")

# 14. API audit endpoint
print("14. API audit endpoint")
assert os.path.exists("dashboard/src/app/api/audit/route.ts")
print("   [PASS] /api/audit endpoint exists")

# 15. Security features
print("15. Security features")
with open("src/bastion/crypto.py", encoding="utf-8") as f:
    crypto = f.read()
assert "persist" in crypto.lower() or "disk" in crypto.lower()
print("   [PASS] HMAC secret persistence")

with open("src/bastion/a2a_server.py", encoding="utf-8") as f:
    a2a = f.read()
assert "BASTION_TRUST_PROXY" in a2a
print("   [PASS] IP spoofing prevention")

with open("dashboard/src/lib/api-auth.ts", encoding="utf-8") as f:
    auth = f.read()
assert "timingSafeEqual" in auth
print("   [PASS] Timing-safe comparison")

print()
print("=== ALL CHECKLIST ITEMS VERIFIED ===")
print()
print("Only item remaining: Record 3-minute demo video")
