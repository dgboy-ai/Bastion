import os

print("=== LIVE CONNECTION STATUS ===")
print(f"BASTION_CONN: {'SET' if os.environ.get('BASTION_CONN') else 'NOT SET'}")
print(f"AWS_REGION: {os.environ.get('AWS_REGION', 'not set')}")
print(f"BASTION_MOCK: {os.environ.get('BASTION_MOCK', 'not set')}")
print()

# Check what the default behavior would be
from bastion.memory import BastionMemory
try:
    m = BastionMemory("test", mock=True)
    print(f"Default mock mode: {m._mock}")
except Exception as e:
    print(f"Error: {e}")
