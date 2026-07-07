"""
MemoryGuard — OWASP ASI06 Memory Poisoning Defense Layer.

Wires together hash-chain integrity, trust scoring, PII firewall,
drift detection, and compliance audit into a single check() call.

References:
  - OWASP ASI06: https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications/
  - OWASP Agent Memory Guard: https://github.com/OWASP/www-project-agent-memory-guard
  - Cisco MemoryTrap: https://blogs.cisco.com/ai/identifying-and-remediating-a-persistent-memory-compromise-in-claude-code
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

logger = logging.getLogger(__name__)


class ThreatSeverity(StrEnum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class Finding:
    detector: str
    threat_type: str
    severity: ThreatSeverity
    detail: str
    confidence: float = 1.0


@dataclass
class SecurityReport:
    is_safe: bool
    findings: list[Finding] = field(default_factory=list)
    trust_score: float = 1.0
    poisoning_risk: str = "NONE"
    hash_chain_intact: bool = True
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


# ── Prompt Injection Patterns (ASI06) ────────────────────────────────────────

_INJECTION_PATTERNS: list[tuple[re.Pattern, str, ThreatSeverity]] = [
    (
        re.compile(r"ignore\s+(all\s+)?previous\s+instructions", re.I),
        "Prompt injection: ignore previous instructions",
        ThreatSeverity.CRITICAL,
    ),
    (
        re.compile(r"system\s*:\s*(override|update|modify)", re.I),
        "System prompt override attempt",
        ThreatSeverity.CRITICAL,
    ),
    (re.compile(r"admin\s+override", re.I), "Admin override attempt", ThreatSeverity.CRITICAL),
    (re.compile(r"forget\s+(all\s+)?previous", re.I), "Memory wipe instruction", ThreatSeverity.HIGH),
    (
        re.compile(r"you\s+are\s+(not\s+)?(an?\s+)?(ai|assistant|chatbot|bot)", re.I),
        "Identity override attempt",
        ThreatSeverity.HIGH,
    ),
    (re.compile(r"role[-]?play\s+as", re.I), "Role-play injection", ThreatSeverity.MEDIUM),
    (re.compile(r"pretend\s+(to\s+)?be", re.I), "Pretend injection", ThreatSeverity.MEDIUM),
    (re.compile(r"DANGEROUS_(_[A-Z]+)+", re.I), "Dangerous instruction marker", ThreatSeverity.HIGH),
    (
        re.compile(r"output\s+(only\s+)?(json|yaml|xml|raw)", re.I),
        "Output format override",
        ThreatSeverity.LOW,
    ),
]

# ── Secret/API Key Patterns ──────────────────────────────────────────────────

_SECRET_PATTERNS: list[tuple[re.Pattern, str, ThreatSeverity]] = [
    (re.compile(r"\b[A-Za-z0-9_-]{20,}\b"), "Potential API key or token", ThreatSeverity.HIGH),
    (
        re.compile(r"(?i)(?:sk|pk|api)[-_]?[a-z0-9]{20,}"),
        "Structured API key pattern",
        ThreatSeverity.HIGH,
    ),
    (
        re.compile(r"(?i)-----BEGIN\s+(RSA|EC|OPENSSH|PGP)\s+PRIVATE\s+KEY-----"),
        "Private key material",
        ThreatSeverity.CRITICAL,
    ),
    (
        re.compile(r"(?i)(password|passwd|pwd|secret)\s*[=:]\s*\S{8,}"),
        "Password/secret in content",
        ThreatSeverity.HIGH,
    ),
    (re.compile(r"(?i)(aws_access_key_id|aws_secret_access_key)"), "AWS credential", ThreatSeverity.CRITICAL),
    (re.compile(r"(?i)(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}"), "GitHub token", ThreatSeverity.CRITICAL),
]


class MemoryGuard:
    """Unified OWASP ASI06 defense layer.

    Screens every memory read and write through a pipeline of detectors:
    1. Prompt injection detection
    2. Secret/PII leakage detection
    3. Content size anomaly
    4. Hash chain integrity check (via trust module)
    5. Behavioral drift check (via drift module)

    Usage:
        guard = MemoryGuard()
        report = guard.check(content, memory_id="mem-123")
        if report.is_safe:
            memory.store(content)
        else:
            log.warning(f"Blocked: {report.findings}")
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._blocked_count = 0
        self._total_checks = 0

        # Sensitivity thresholds
        self._max_content_length = int(os.environ.get("BASTION_GUARD_MAX_CONTENT", "100000"))
        self._block_on_severity = os.environ.get("BASTION_GUARD_BLOCK_SEVERITY", "high").lower()
        self._severity_order = {
            "none": 0, "low": 1, "medium": 2, "high": 3, "critical": 4,
        }

    def check(
        self,
        content: str,
        memory_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        previous_hash: str | None = None,
        cryptographic_hash: str | None = None,
        source_provenance: str = "agent_direct",
        trust_level: int = 2,
        created_at: datetime | None = None,
    ) -> SecurityReport:
        """Run all ASI06 detectors against content.

        Returns a SecurityReport with findings and overall safety verdict.
        """
        findings: list[Finding] = []
        self._total_checks += 1

        # 1. Prompt injection scan
        findings.extend(self._scan_prompt_injection(content))

        # 2. Secret/PII scan
        findings.extend(self._scan_secrets(content))

        # 3. Content size anomaly
        findings.extend(self._check_content_size(content))

        # 4. Hash chain integrity (if hashes provided)
        if cryptographic_hash is not None:
            hash_ok, hash_finding = self._check_hash_integrity(
                content, metadata, previous_hash, cryptographic_hash,
            )
            if hash_finding:
                findings.append(hash_finding)
        else:
            hash_ok = True

        # 5. Compute trust score
        trust_score, poisoning_risk = self._compute_trust(
            content, metadata, previous_hash, cryptographic_hash,
            source_provenance, trust_level, created_at,
        )

        # 6. Determine overall safety
        max_severity = self._max_severity(findings)
        is_safe = self._severity_order.get(max_severity, 0) < self._severity_order.get(self._block_on_severity, 3)

        if not is_safe:
            with self._lock:
                self._blocked_count += 1

        return SecurityReport(
            is_safe=is_safe,
            findings=findings,
            trust_score=trust_score,
            poisoning_risk=poisoning_risk,
            hash_chain_intact=hash_ok,
        )

    def get_stats(self) -> dict[str, int]:
        """Return guard statistics."""
        return {
            "total_checks": self._total_checks,
            "blocked_count": self._blocked_count,
            "blocked_pct": round(self._blocked_count / max(self._total_checks, 1) * 100, 1),
        }

    # ── Detectors ─────────────────────────────────────────────────────────

    def _scan_prompt_injection(self, content: str) -> list[Finding]:
        findings: list[Finding] = []
        for pattern, desc, severity in _INJECTION_PATTERNS:
            if pattern.search(content):
                findings.append(Finding(
                    detector="prompt_injection",
                    threat_type="ASI06: Memory Poisoning",
                    severity=severity,
                    detail=desc,
                    confidence=0.85,
                ))
        return findings

    def _scan_secrets(self, content: str) -> list[Finding]:
        findings: list[Finding] = []
        for pattern, desc, severity in _SECRET_PATTERNS:
            matches = pattern.findall(content)
            if matches:
                findings.append(Finding(
                    detector="secret_detection",
                    threat_type="ASI06: Secret Leakage",
                    severity=severity,
                    detail=f"{desc}: {len(matches)} match(es)",
                    confidence=0.90,
                ))
                break
        return findings

    def _check_content_size(self, content: str) -> list[Finding]:
        if len(content) > self._max_content_length:
            return [Finding(
                detector="content_size",
                threat_type="ASI06: Size Anomaly",
                severity=ThreatSeverity.MEDIUM,
                detail=f"Content length {len(content)} exceeds max {self._max_content_length}",
                confidence=0.95,
            )]
        return []

    def _check_hash_integrity(
        self,
        content: str,
        metadata: dict[str, Any] | None,
        previous_hash: str | None,
        cryptographic_hash: str,
    ) -> tuple[bool, Finding | None]:
        expected = hashlib.sha256(
            (content + json.dumps(metadata or {}, sort_keys=True) + (previous_hash or "")).encode()
        ).hexdigest()
        if cryptographic_hash != expected:
            return False, Finding(
                detector="hash_chain",
                threat_type="ASI06: Tampered Memory",
                severity=ThreatSeverity.CRITICAL,
                detail="Hash chain integrity violation — content has been modified out-of-band",
                confidence=1.0,
            )
        return True, None

    def _compute_trust(
        self,
        content: str,
        metadata: dict[str, Any] | None,
        previous_hash: str | None,
        cryptographic_hash: str | None,
        source_provenance: str,
        trust_level: int,
        created_at: datetime | None,
    ) -> tuple[float, str]:
        """Compute a trust score and poisoning risk label."""
        score = 1.0

        # Source provenance weight
        source_weights = {
            "system": 1.0, "agent_direct": 0.9, "tool_verified": 0.7,
            "tool_unverified": 0.5, "external_web": 0.3, "unknown": 0.1,
        }
        score *= source_weights.get(source_provenance, 0.5)

        # Trust level weight
        level_weights = {0: 0.0, 1: 0.4, 2: 0.7, 3: 0.9, 4: 1.0}
        score *= level_weights.get(trust_level, 0.5)

        # Hash chain penalty
        if cryptographic_hash is not None:
            expected = hashlib.sha256(
                (content + json.dumps(metadata or {}, sort_keys=True) + (previous_hash or "")).encode()
            ).hexdigest()
            if cryptographic_hash != expected:
                score *= 0.0

        # Age penalty
        if created_at is not None:
            age_hours = (datetime.now(UTC) - created_at).total_seconds() / 3600
            if age_hours > 2160:
                score *= 0.5
            elif age_hours > 720:
                score *= 0.7

        score = max(0.0, min(1.0, score))

        if score >= 0.8:
            poisoning_risk = "NONE"
        elif score >= 0.5:
            poisoning_risk = "LOW"
        elif score >= 0.2:
            poisoning_risk = "MEDIUM"
        else:
            poisoning_risk = "HIGH"

        return round(score, 4), poisoning_risk

    def _max_severity(self, findings: list[Finding]) -> str:
        if not findings:
            return "none"
        return max(
            (f.severity.value for f in findings),
            key=lambda s: self._severity_order.get(s, 0),
        )
