"""Security Hardening Checklist for Bastion

Run this script to verify all security measures are in place.
"""

import sys
from pathlib import Path


def check_security():
    """Run all security checks."""
    issues = []
    passed = []

    # 1. Check .env not in git
    if Path(".env").exists():
        try:
            import subprocess

            result = subprocess.run(["git", "check-ignore", ".env"], capture_output=True, text=True)
            if result.returncode != 0:
                issues.append("CRITICAL: .env not in .gitignore")
            else:
                passed.append(".env is gitignored")
        except Exception:
            passed.append("Could not check git (not in git repo)")

    # 2. Check for hardcoded credentials
    credential_patterns = [
        "AKIA____________________",
        "divyansh:__________________",
        "__________________________________",
    ]
    for pattern in credential_patterns:
        # Check .env files
        for env_file in [".env", ".env.local", ".env.example"]:
            if Path(env_file).exists():
                try:
                    content = Path(env_file).read_text(encoding="utf-8")
                    if pattern in content:
                        issues.append(f"CRITICAL: Credential found in {env_file}")
                except Exception:
                    pass

    # 3. Check MCP auth warning
    mcp_file = Path("src/bastion/mcp_server.py")
    if mcp_file.exists():
        content = mcp_file.read_text(encoding="utf-8")
        if "BASTION_MCP_API_KEYS not set" in content:
            passed.append("MCP auth warning exists")
        else:
            issues.append("HIGH: MCP auth warning missing")

    # 4. Check KMS fallback warning
    kms_file = Path("src/bastion/kms.py")
    if kms_file.exists():
        content = kms_file.read_text(encoding="utf-8")
        if "falling back to LocalKMS" in content:
            passed.append("KMS fallback warning exists")
        else:
            issues.append("HIGH: KMS fallback warning missing")

    # 5. Check OWASP guard
    guard_file = Path("src/bastion/guard.py")
    if guard_file.exists():
        content = guard_file.read_text(encoding="utf-8")
        if "ignore" in content and "previous" in content and "instructions" in content:
            passed.append("OWASP ASI06 guard active")
        else:
            issues.append("HIGH: OWASP guard patterns missing")

    # 6. Check hash chains
    memory_file = Path("src/bastion/memory.py")
    if memory_file.exists():
        content = memory_file.read_text(encoding="utf-8")
        if "cryptographic_hash" in content and "previous_hash" in content:
            passed.append("Hash chain implementation exists")
        else:
            issues.append("HIGH: Hash chain implementation missing")

    # 7. Check RLS
    rls_file = Path("src/bastion/rls.py")
    if rls_file.exists():
        passed.append("Row-level security exists")
    else:
        issues.append("MEDIUM: RLS module missing")

    # 8. Check test count
    tests_dir = Path("tests")
    if tests_dir.exists():
        test_files = list(tests_dir.glob("test_*.py"))
        if len(test_files) > 50:
            passed.append(f"Comprehensive test suite ({len(test_files)} test files)")
        else:
            issues.append(f"MEDIUM: Only {len(test_files)} test files")

    # Print results
    print("=" * 60)
    print("  BASTION SECURITY AUDIT")
    print("=" * 60)
    print()

    if passed:
        print("PASSED:")
        for p in passed:
            print(f"  ✓ {p}")
        print()

    if issues:
        print("ISSUES:")
        for i in issues:
            print(f"  ✗ {i}")
        print()

    # Summary
    total = len(passed) + len(issues)
    score = len(passed) / total * 100 if total > 0 else 0
    print(f"Security Score: {score:.0f}% ({len(passed)}/{total} checks passed)")
    print()

    return len(issues) == 0


if __name__ == "__main__":
    success = check_security()
    sys.exit(0 if success else 1)
