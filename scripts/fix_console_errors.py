"""Fix console.error in route files to log error.message instead of full error object."""
import re
from pathlib import Path

routes_dir = Path(r"C:\projects\bastion\dashboard\src\app\api")
fixed = 0
for f in sorted(routes_dir.rglob("route.ts")):
    content = f.read_text(encoding="utf-8")
    # Fix console.error that logs full error object
    new_content = re.sub(
        r'console\.error\(([^)]+?),\s*error\)',
        r"console.error(\1, error instanceof Error ? error.message : 'Unknown error')",
        content,
    )
    if new_content != content:
        f.write_text(new_content, encoding="utf-8")
        print(f"Fixed: {f.relative_to(routes_dir.parent.parent)}")
        fixed += 1
print(f"Fixed {fixed} route files")
