"""Shared PII detection and redaction patterns.

Consolidates PII logic that was previously duplicated across agent.py, guard.py,
and firewall.py into a single source of truth.
"""

import re

# ── PII Patterns ─────────────────────────────────────────────────────────────

PII_PATTERNS: dict[str, re.Pattern] = {
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"),
    "phone": re.compile(r"\b(\+\d{1,3}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b"),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "credit_card": re.compile(r"\b(?:\d{4}[\s-]?){3}\d{4}\b"),
    "ipv4": re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
}

# Redaction replacement map (for agent.py-style redaction)
REDACTION_MAP: dict[str, str] = {
    "ssn": "[REDACTED_SSN]",
    "email": "[REDACTED_EMAIL]",
    "phone": "[REDACTED_PHONE]",
    "credit_card": "[REDACTED_CARD]",
    "ipv4": "[REDACTED_IP]",
}

# Detection-only patterns (for firewall.py-style detection)
PII_DETECTION_PATTERNS: list[tuple[str, str, str]] = [
    ("ssn", r"\b\d{3}-\d{2}-\d{4}\b", "SSN detected"),
    ("email", r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "Email detected"),
    ("credit_card", r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b", "Credit card detected"),
    ("phone", r"\b(\+\d{1,3}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b", "Phone number detected"),
    ("ipv4", r"\b(?:\d{1,3}\.){3}\d{1,3}\b", "IP address detected"),
]


def scan_pii(content: str) -> list[str]:
    """Scan content for PII types. Returns list of detected PII type names."""
    detected = []
    for pii_type, pattern in PII_PATTERNS.items():
        if pattern.search(content):
            detected.append(pii_type)
    return detected


def redact_pii(content: str) -> tuple[str, list[dict]]:
    """Detect and redact PII from text.

    Returns:
        (redacted_text, list_of_redactions) where each redaction is
        {"type": str, "original": str, "redacted": str}.
    """
    redactions = []
    redacted = content

    for pii_type, pattern in PII_PATTERNS.items():
        matches = pattern.findall(redacted)
        for match in matches:
            original = match if isinstance(match, str) else match[0] if match else ""
            if original:
                replacement = REDACTION_MAP.get(pii_type, f"[REDACTED_{pii_type.upper()}]")
                redactions.append({
                    "type": pii_type,
                    "original": original,
                    "redacted": replacement,
                })
        redacted = pattern.sub(REDACTION_MAP.get(pii_type, f"[REDACTED_{pii_type.upper()}]"), redacted)

    return redacted, redactions
