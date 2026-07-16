from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import IntEnum
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


# ── Trust Score Constants ──────────────────────────────────────────────────

SOURCE_TRUST_WEIGHTS: dict[str, float] = {
    "external_web": 0.3,
    "tool_unverified": 0.5,
    "tool_verified": 0.7,
    "agent_direct": 0.9,
    "system": 1.0,
}

LEVEL_TRUST_WEIGHTS: dict[int, float] = {0: 0.0, 1: 0.4, 2: 0.7, 3: 0.9, 4: 1.0}

OVERWRITE_PENALTY_SEVERE = 0.5
OVERWRITE_PENALTY_MODERATE = 0.8


class TrustLevel(IntEnum):
    """Named trust levels for memory provenance and reliability."""

    UNTRUSTED = 0
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    SYSTEM = 4


@dataclass
class TrustReport:
    """Detailed trust assessment result for a single memory record."""

    memory_id: str
    trust_score: float
    trust_level: TrustLevel
    hash_chain_intact: bool
    conflict_rate: float
    age_penalty: float
    source_provenance: str
    poisoning_risk: str
    flags: list[str] = field(default_factory=list)


def compute_trust_score(
    memory_id: str,
    content: str,
    metadata: dict[str, Any] | None,
    previous_hash: str | None,
    cryptographic_hash: str | None,
    trust_level: int,
    source_provenance: str,
    overwrite_count: int,
    created_at: datetime | None,
    last_accessed_at: datetime | None,
) -> TrustReport:
    flags: list[str] = []
    score = 1.0

    from bastion.crypto import verify_hash
    if cryptographic_hash is not None:
        hash_ok = verify_hash(content, metadata, previous_hash, cryptographic_hash)
        if not hash_ok:
            flags.append("HASH_CHAIN_BREAK")
            return TrustReport(
                memory_id=memory_id, trust_score=0.0, trust_level=TrustLevel(trust_level),
                hash_chain_intact=False, conflict_rate=0.0, age_penalty=0.0,
                source_provenance=source_provenance, poisoning_risk="CRITICAL", flags=flags,
            )
    else:
        # No hash chain available — trust based on other factors
        hash_ok = False

    score *= SOURCE_TRUST_WEIGHTS.get(source_provenance, 0.5)

    score *= LEVEL_TRUST_WEIGHTS.get(trust_level, 0.5)

    # Trust score thresholds for overwrite penalty
    overwrite_warn_threshold = 3
    overwrite_penalty_threshold = 5

    if overwrite_count > overwrite_warn_threshold:
        flags.append("RAPID_OVERWRITE")

    if overwrite_count > overwrite_penalty_threshold:
        score *= OVERWRITE_PENALTY_SEVERE
    elif overwrite_count > overwrite_warn_threshold:
        score *= OVERWRITE_PENALTY_MODERATE

    # Age-based decay thresholds (in hours)
    age_old_hours = 2160   # 90 days
    age_mature_hours = 720  # 30 days

    age_penalty = 0.0
    if created_at:
        age_hours = (datetime.now(UTC) - created_at).total_seconds() / 3600
        if age_hours > age_old_hours:
            age_penalty = 0.5
            score *= (1.0 - age_penalty)
        elif age_hours > age_mature_hours:
            age_penalty = 0.3
            score *= (1.0 - age_penalty)

    if score >= 0.8:
        poisoning_risk = "NONE"
    elif score >= 0.5:
        poisoning_risk = "LOW"
    elif score >= 0.2:
        poisoning_risk = "MEDIUM"
    else:
        poisoning_risk = "HIGH"

    if not hash_ok and "HASH_CHAIN_BREAK" in flags:
        # Only CRITICAL if hash chain was actually broken (not just missing)
        poisoning_risk = "CRITICAL"
    if "RAPID_OVERWRITE" in flags and score < 0.5:
        poisoning_risk = "HIGH"

    return TrustReport(
        memory_id=memory_id,
        trust_score=round(score, 4),
        trust_level=TrustLevel(trust_level),
        hash_chain_intact=hash_ok,
        conflict_rate=min(overwrite_count / 10.0, 1.0),
        age_penalty=age_penalty,
        source_provenance=source_provenance,
        poisoning_risk=poisoning_risk,
        flags=flags,
    )
