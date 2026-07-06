import importlib
import sys
sys.path.insert(0, "src")

features = {
    "Trust Scoring": "bastion.trust",
    "Drift Detection": "bastion.drift",
    "CRDT Memory": "bastion.crdt_memory",
    "Merkle Hash Chain": "bastion.merkle",
    "MCP Server": "bastion.mcp_server",
    "A2A Server": "bastion.a2a_server",
    "Groq Callback": "bastion.groq_callback",
    "Analytics": "bastion.analytics",
    "Telemetry": "bastion.telemetry",
    "Agent": "bastion.agent",
    "Memory": "bastion.memory",
    "Bridge Mem0": "bastion.bridge_mem0",
    "KMS": "bastion.kms",
}

print("=== FEATURE STATUS ===")
for name, module in features.items():
    try:
        importlib.import_module(module)
        print(f"  ✅ {name}")
    except Exception as e:
        print(f"  ❌ {name}: {e}")

print("\n=== TEST COUNT ===")
import subprocess
result = subprocess.run(["python", "-m", "pytest", "tests/", "--tb=no", "-q"], capture_output=True, text=True)
for line in result.stdout.strip().split("\n"):
    if "passed" in line or "failed" in line:
        print(f"  {line}")
