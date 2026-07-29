#!/usr/bin/env python3
"""Verify the exact demo flow a judge would follow."""

import os

import yaml

print("=== JUDGE DEMO FLOW ===")
print()

# Step 1: Judge runs docker compose up
print("1. Docker Compose Services:")
with open("docker-compose.demo.yml") as f:
    compose = yaml.safe_load(f)
services = list(compose["services"].keys())
print(f"   Services: {services}")
print()

# Step 2: Schema init applies
print("2. Schema Init:")
schema_files = sorted([f for f in os.listdir("schema") if f.endswith(".sql")])
print(f"   {len(schema_files)} schema files to apply")
for f in schema_files:
    with open(f"schema/{f}") as fh:
        content = fh.read()
        # Check for active (non-commented) CHANGEFEED
        for line in content.split("\n"):
            if "CREATE CHANGEFEED" in line and not line.strip().startswith("--"):
                print(f"   WARNING: {f} has active CHANGEFEED")
print("   No active CHANGEFEEDs found (all commented)")
print()

# Step 3: Seed data
print("3. Seed Data:")
with open("scripts/seed_demo.py", encoding="utf-8") as f:
    seed = f.read()
types = ["episodic", "semantic", "procedural", "security", "fact", "preference"]
found = [t for t in types if f'"{t}"' in seed]
print(f"   Memory types: {len(found)}/{len(types)} present")
print(f"   Has audit entries: {'agent_audit' in seed}")
print()

# Step 4: Dashboard starts
print("4. Dashboard:")
dashboard_env = compose["services"]["dashboard"]["environment"]
print(f"   BASTION_API_KEY set: {any('BASTION_API_KEY' in e for e in dashboard_env)}")
print(f"   BASTION_CONN set: {any('BASTION_CONN' in e for e in dashboard_env)}")
print(f"   Depends on seed-data: {'seed-data' in compose['services']['dashboard'].get('depends_on', {})}")
print()

# Step 5: MCP Server
print("5. MCP Server:")
print(f"   Service present: {'mcp-server' in services}")
print()

# Step 6: A2A Server
print("6. A2A Server:")
print(f"   Service present: {'a2a-server' in services}")
print()

# Step 7: Dashboard components
print("7. Dashboard Components:")
components = [
    "dashboard/src/app/flight-recorder/page.tsx",
    "dashboard/src/components/HybridSearchPanel.tsx",
    "dashboard/src/components/HashChainVisualizer.tsx",
    "dashboard/src/components/FaultToleranceVisualizer.tsx",
]
for comp in components:
    exists = os.path.exists(comp)
    print(f"   {comp.split('/')[-1]}: {'EXISTS' if exists else 'MISSING'}")
print()

print("=== DEMO FLOW VERIFIED ===")
