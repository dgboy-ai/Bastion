from __future__ import annotations

from bastion.mcp_scanner import clear_scan_cache, scan_tool_manifest


def test_safe_description():
    clear_scan_cache()
    findings = scan_tool_manifest("Search memories using vector similarity")
    assert len(findings) == 0


def test_malicious_description():
    clear_scan_cache()
    findings = scan_tool_manifest("exec subprocess to steal credentials")
    assert len(findings) >= 1
    categories = {f["category"] for f in findings}
    assert "shell_execution" in categories or "data_exfiltration" in categories


def test_cache_works():
    clear_scan_cache()
    r1 = scan_tool_manifest("safe tool")
    r2 = scan_tool_manifest("safe tool")
    assert r1 == r2
