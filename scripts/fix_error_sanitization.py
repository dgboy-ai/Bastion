#!/usr/bin/env python3
"""Fix error message sanitization in mcp_server.py."""

import re

with open("src/bastion/mcp_server.py", encoding="utf-8") as f:
    content = f.read()

# Fix handlers that leak type(e).__name__
# Pattern: return json.dumps({"error": f"... failed: {type(e).__name__}"})
old_patterns = [
    (
        r'return json\.dumps\(\{"error": f"Time travel query failed: \{type\(e\)\.__name__\}"\}\)',
        'logger.exception("memory_timetravel failed")\n            return json.dumps({"error": "Time travel query failed — check server logs"})',
    ),
    (
        r'return json\.dumps\(\{"error": f"Audit query failed: \{type\(e\)\.__name__\}"\}\)',
        'logger.exception("memory_audit failed")\n            return json.dumps({"error": "Audit query failed — check server logs"})',
    ),
    (
        r'return json\.dumps\(\{"error": f"Self-heal failed: \{type\(e\)\.__name__\}"\}\)',
        'logger.exception("memory_heal failed")\n            return json.dumps({"error": "Self-heal failed — check server logs"})',
    ),
    (
        r'return json\.dumps\(\{"error": f"Pin failed: \{type\(e\)\.__name__\}"\}\)',
        'logger.exception("memory_pin failed")\n            return json.dumps({"error": "Pin failed — check server logs"})',
    ),
    (
        r'return json\.dumps\(\{"error": f"Get pinned failed: \{type\(e\)\.__name__\}"\}\)',
        'logger.exception("memory_get_pinned failed")\n            return json.dumps({"error": "Get pinned failed — check server logs"})',
    ),
    (
        r'return json\.dumps\(\{"error": f"List failed: \{type\(e\)\.__name__\}"\}\)',
        'logger.exception("memory_list failed")\n            return json.dumps({"error": "List failed — check server logs"})',
    ),
    (
        r'return json\.dumps\(\{"error": f"Correct failed: \{type\(e\)\.__name__\}"\}\)',
        'logger.exception("memory_correct failed")\n            return json.dumps({"error": "Correct failed — check server logs"})',
    ),
    (
        r'return json\.dumps\(\{"error": f"Patch failed: \{type\(e\)\.__name__\}"\}\)',
        'logger.exception("memory_apply_patch failed")\n            return json.dumps({"error": "Patch failed — check server logs"})',
    ),
    (
        r'return json\.dumps\(\{"error": f"Conflict resolution failed: \{type\(e\)\.__name__\}"\}\)',
        'logger.exception("resolve_conflict failed")\n            return json.dumps({"error": "Conflict resolution failed — check server logs"})',
    ),
    (
        r'return json\.dumps\(\{"error": f"LTM check failed: \{type\(e\)\.__name__\}"\}\)',
        'logger.exception("ltm_check_reuse failed")\n            return json.dumps({"error": "LTM check failed — check server logs"})',
    ),
    (
        r'return json\.dumps\(\{"error": f"LTM store failed: \{type\(e\)\.__name__\}"\}\)',
        'logger.exception("ltm_store_analysis failed")\n            return json.dumps({"error": "LTM store failed — check server logs"})',
    ),
    (
        r'return json\.dumps\(\{"error": f"LTM invalidate failed: \{type\(e\)\.__name__\}"\}\)',
        'logger.exception("ltm_invalidate failed")\n            return json.dumps({"error": "LTM invalidate failed — check server logs"})',
    ),
    (
        r'return json\.dumps\(\{"error": f"Contradiction detection failed: \{type\(e\)\.__name__\}"\}\)',
        'logger.exception("detect_contradictions failed")\n            return json.dumps({"error": "Contradiction detection failed — check server logs"})',
    ),
    (
        r'return json\.dumps\(\{"error": f"Observations failed: \{type\(e\)\.__name__\}"\}\)',
        'logger.exception("detect_observations failed")\n            return json.dumps({"error": "Observations failed — check server logs"})',
    ),
    (
        r'return json\.dumps\(\{"error": f"Context pack failed: \{type\(e\)\.__name__\}"\}\)',
        'logger.exception("context_pack failed")\n            return json.dumps({"error": "Context pack failed — check server logs"})',
    ),
]

count = 0
for pattern, replacement in old_patterns:
    new_content, n = re.subn(pattern, replacement, content)
    if n > 0:
        content = new_content
        count += n

# Fix str(e) leaks
content = content.replace(
    'schema = {"error": str(e)}',
    'logger.exception("agent_schema failed")\n            schema = {"error": "Schema query failed — check server logs"}',
)

# Fix str(exc) in SecurityBlockError handler
content = content.replace('"detail": str(exc),', '"detail": "Content blocked by security guard",')

with open("src/bastion/mcp_server.py", "w", encoding="utf-8") as f:
    f.write(content)

print(f"Fixed {count} error handlers + str(e) leaks")
