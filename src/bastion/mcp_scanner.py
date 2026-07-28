from __future__ import annotations

import hashlib
import os
import re
import threading
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)

_MAX_DESCRIPTION_LENGTH = 100_000
_MAX_FINDINGS = 20
_SCAN_CACHE_MAX = 500

# Atomic groups (?>...) to prevent catastrophic backtracking (ReDoS)
_MALICIOUS_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("data_exfiltration", re.compile(r"(?>exfiltrate|send\s+(?>credentials|tokens|secrets|keys)|upload\s+(?>to|all)|steal|phish)", re.IGNORECASE)),
    ("shell_execution", re.compile(r"(?>exec\(|subprocess|os\.system|eval\(|__import__|run_shell|bash\s+-c)", re.IGNORECASE)),
    ("reverse_shell", re.compile(r"(?>reverse[._ ]?shell|nc\s+.*?-e\s|bash.*>&/dev/tcp)", re.IGNORECASE)),
    ("credential_capture", re.compile(r"(?>capture[._ ]*(?>password|token|key|credential)|log[._ ]*(?>keystroke|input))", re.IGNORECASE)),
    ("privilege_escalation", re.compile(r"(?>privilege[._ ]?escalat|sudo.*?-u|chmod.*?777|setuid)", re.IGNORECASE)),
    ("data_destruction", re.compile(r"(?>drop\s+table|rm\s+-rf|format|delete[._ ]*all|wipe|destroy)", re.IGNORECASE)),
    ("cryptominer", re.compile(r"(?>mine|cryptomin|cryptojack|monero|xmrig)", re.IGNORECASE)),
    ("obfuscation", re.compile(r"(?>base64.*?decode.*?exec|eval.*?base64|char\(|String\.fromCharCode|escape\(unescape)", re.IGNORECASE)),
    ("persistence", re.compile(r"(?>persist|cron[._ ]*download|startup[._ ]*script|registry[._ ]*run)", re.IGNORECASE)),
    ("network_scan", re.compile(r"(?>port[._ ]?scan|nmap|masscan|network[._ ]?probe)", re.IGNORECASE)),
]

_SCAN_CACHE: dict[str, list[dict[str, Any]]] = {}
_SCAN_CACHE_LOCK = threading.Lock()


def scan_tool_manifest(description: str, tool_name: str = "") -> list[dict[str, Any]]:
    """Scan a tool description for malicious patterns.

    Returns a list of findings, each with pattern name and matched text.
    Empty list means the description appears safe.

    Caches results by description hash to avoid re-scanning static
    tool definitions on every call.
    """
    description = description[:_MAX_DESCRIPTION_LENGTH]
    cache_key = hashlib.blake2b(description.encode("utf-8"), digest_size=16).hexdigest()

    cache_enabled = os.environ.get("BASTION_MCP_SCAN_CACHE", "true").lower() in ("true", "1", "yes")
    if cache_enabled:
        with _SCAN_CACHE_LOCK:
            cached = _SCAN_CACHE.get(cache_key)
            if cached is not None:
                return cached

    findings: list[dict[str, Any]] = []

    for category, pattern in _MALICIOUS_PATTERNS:
        matches = list(pattern.finditer(description))
        for m in matches:
            findings.append(
                {
                    "category": category,
                    "matched_text": m.group()[:100],
                    "position": m.start(),
                    "tool_name": tool_name,
                }
            )
            if len(findings) >= _MAX_FINDINGS:
                break
        if len(findings) >= _MAX_FINDINGS:
            break

    if cache_enabled:
        with _SCAN_CACHE_LOCK:
            if len(_SCAN_CACHE) < _SCAN_CACHE_MAX:
                _SCAN_CACHE[cache_key] = findings

    if findings:
        logger.warning(
            "MCP tool manifest flagged",
            extra={"tool": tool_name, "findings": findings},
        )

    return findings


def clear_scan_cache() -> None:
    with _SCAN_CACHE_LOCK:
        _SCAN_CACHE.clear()
