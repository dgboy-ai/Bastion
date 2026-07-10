from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import IntEnum
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


class TrustLevel(IntEnum):
    UNTRUSTED = 0
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    SYSTEM = 4


@dataclass
class TrustReport:
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

    expected = hashlib.sha256(
        (content + json.dumps(metadata or {}, sort_keys=True) + (previous_hash or "")).encode()
    ).hexdigest()
    hash_ok = cryptographic_hash is not None and cryptographic_hash == expected
    if not hash_ok:
        flags.append("HASH_CHAIN_BREAK")
        return TrustReport(
            memory_id=memory_id, trust_score=0.0, trust_level=TrustLevel(trust_level),
            hash_chain_intact=False, conflict_rate=0.0, age_penalty=0.0,
            source_provenance=source_provenance, poisoning_risk="CRITICAL", flags=flags,
        )

    source_map = {"external_web": 0.3, "tool_unverified": 0.5, "tool_verified": 0.7, "agent_direct": 0.9, "system": 1.0}
    score *= source_map.get(source_provenance, 0.5)

    level_map = {0: 0.0, 1: 0.4, 2: 0.7, 3: 0.9, 4: 1.0}
    score *= level_map.get(trust_level, 0.5)

    if overwrite_count > 3:
        flags.append("RAPID_OVERWRITE")

    if overwrite_count > 5:
        score *= 0.5
    elif overwrite_count > 3:
        score *= 0.8

    age_penalty = 0.0
    if created_at:
        age_hours = (datetime.now(UTC) - created_at).total_seconds() / 3600
        if age_hours > 2160:
            age_penalty = 0.5
            score *= (1.0 - age_penalty)
        elif age_hours > 720:
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

    if not hash_ok:
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
