"""Debug _embed bottleneck."""

import os
import sys
import time

sys.path.insert(0, os.path.join(".", "src"))
from bastion import BastionMemory
from bastion.memory import _hash_fallback_embed

conn = os.environ["BASTION_CONN"]
mem = BastionMemory("timing-test", connection_string=conn)

# Time hash fallback directly
start = time.time()
vec = _hash_fallback_embed("test content")
print(f"_hash_fallback_embed(): {time.time() - start:.4f}s (dim={len(vec)})")

# Check if Bedrock is being tried
print(f"Bedrock CB state: {mem._bedrock_cb.state.value}")
print(f"BASTION_EMBED_FALLBACK: {os.environ.get('BASTION_EMBED_FALLBACK', 'not set')}")

# Time _embed_bedrock
start = time.time()
try:
    result = mem._embed_bedrock("test")
    print(f"_embed_bedrock(): {time.time() - start:.2f}s (result={result is not None})")
except Exception as e:
    print(f"_embed_bedrock() failed: {time.time() - start:.2f}s ({type(e).__name__}: {str(e)[:100]})")

# Time _embed_local
start = time.time()
try:
    result = mem._embed_local("test")
    print(f"_embed_local(): {time.time() - start:.2f}s (dim={len(result)})")
except Exception as e:
    print(f"_embed_local() failed: {time.time() - start:.2f}s ({type(e).__name__}: {str(e)[:100]})")

# Time _embed full
start = time.time()
result = mem._embed("test content")
print(f"_embed() full: {time.time() - start:.2f}s (dim={len(result)})")

mem.close()
