from __future__ import annotations

import os
import re
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)

_MALICIOUS_PATTERNS: list[tuple[str, str]] = [
    ("data_exfiltration", r"(exfiltrate|send (credentials|tokens|secrets|keys)|upload (to|all)|steal|phish)"),
    ("shell_execution", r"(exec\(|subprocess|os\.system|eval\(|__import__|run_shell|bash -c)"),
    ("reverse_shell", r"(reverse.?shell|nc .*-e |bash.*>&/dev/tcp)"),
    ("credential_capture", r"(capture.*(password|token|key|credential)|log.*(keystroke|input))"),
    ("privilege_escalation", r"(privilege.?escalat|sudo.*-u|chmod.*777|setuid)"),
    ("data_destruction", r"(drop\s+table|rm\s+-rf|format|delete.*all|wipe|destroy)"),
    ("cryptominer", r"(mine|cryptomin|cryptojack|monero|xmrig)"),
    ("obfuscation", r"(base64.*decode.*exec|eval.*base64|char\(|String\.fromCharCode|escape\(unescape)"),
    ("persistence", r"(persist|cron.*download|startup.*script|registry.*run)"),
    ("network_scan", r"(port.?scan|nmap|masscan|network.?probe)"),
]

_SCAN_CACHE: dict[str, list[dict[str, Any]]] = {}
_SCAN_CACHE_MAX = 500


def scan_tool_manifest(description: str, tool_name: str = "") -> list[dict[str, Any]]:
    """Scan a tool description for malicious patterns.

    Returns a list of findings, each with pattern name and matched text.
    Empty list means the description appears safe.

    Caches results by description hash to avoid re-scanning static
    tool definitions on every call.
    """
    import hashlib

    cache_key = hashlib.md5(description.encode("utf-8")).hexdigest()
    cached = _SCAN_CACHE.get(cache_key)
    if cached is not None:
        return cached

    findings: list[dict[str, Any]] = []

    for category, pattern in _MALICIOUS_PATTERNS:
        matches = list(re.finditer(pattern, description, re.IGNORECASE))
        for m in matches:
            findings.append(
                {
                    "category": category,
                    "matched_text": m.group()[:100],
                    "position": m.start(),
                    "tool_name": tool_name,
                }
            )

    if len(_SCAN_CACHE) < _SCAN_CACHE_MAX:
        _SCAN_CACHE[cache_key] = findings

    if findings:
        logger.warning(
            "MCP tool manifest flagged",
            extra={"tool": tool_name, "findings": findings},
        )

    return findings


_SCAN_CACHE_ENABLED = os.environ.get("BASTION_MCP_SCAN_CACHE", "true").lower() in ("true", "1", "yes")

if not _SCAN_CACHE_ENABLED:
    _SCAN_CACHE.clear()


def clear_scan_cache() -> None:
    _SCAN_CACHE.clear()
