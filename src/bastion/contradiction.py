"""Automatic Contradiction Detection for Temporal Fact Invalidation.

When a new memory is stored, this module scans existing memories for
semantic similarity and detects factual contradictions. When found,
old memories are auto-superseded (tagged as stale with provenance)
while preserving the audit trail.

This is the auto-detection layer that Zep implements natively. On
CockroachDB, we leverage MVCC + vector similarity to detect contradictions
efficiently.

Usage:
    detector = ContradictionDetector(memory_engine)
    result = detector.scan_after_store(new_memory_record)
    if result.contradictions_found > 0:
        print(f"Auto-invalidated {result.contradictions_found} stale memories")
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)

# Negation patterns that flip factual polarity
_NEGATION_PATTERNS = [
    (r"\bis\b", r"\bis not\b"),
    (r"\bare\b", r"\bare not\b"),
    (r"\bwill\b", r"\bwill not\b"),
    (r"\bcan\b", r"\bcannot\b"),
    (r"\bshould\b", r"\bshould not\b"),
    (r"\buses?\b", r"\bdoes not use\b"),
    (r"\bhas\b", r"\bhas not\b"),
    (r"\bwas\b", r"\bwas not\b"),
    (r"\bincreases?\b", r"\bdecreases?\b"),
    (r"\bhighest\b", r"\ lowest\b"),
    (r"\bfaster\b", r"\bslower\b"),
    (r"\bmore\b", r"\bless\b"),
    (r"\benabled\b", r"\bdisabled\b"),
    (r"\btrue\b", r"\bfalse\b"),
    (r"\byes\b", r"\bno\b"),
]

# Temporal signals that indicate recency
_TEMPORAL_KEYWORDS = frozenset({
    "now", "currently", "today", "yesterday", "this week", "this month",
    "recently", "latest", "updated", "changed", "switched to", "migrated to",
    "upgraded to", "deprecated", "removed", "replaced",
})


@dataclass
class Contradiction:
    """A detected contradiction between two memories."""
    new_memory_id: str
    old_memory_id: str
    new_content: str
    old_content: str
    similarity: float
    contradiction_type: str  # "negation", "temporal", "semantic"
    confidence: float
    auto_resolved: bool = False
    resolution: str = ""  # "superseded", "manual_review", "kept_both"

    def to_dict(self) -> dict[str, Any]:
        return {
            "new_memory_id": self.new_memory_id,
            "old_memory_id": self.old_memory_id,
            "new_content": self.new_content[:200],
            "old_content": self.old_content[:200],
            "similarity": round(self.similarity, 4),
            "contradiction_type": self.contradiction_type,
            "confidence": round(self.confidence, 4),
            "auto_resolved": self.auto_resolved,
            "resolution": self.resolution,
        }


@dataclass
class ContradictionScanResult:
    """Result of a contradiction scan."""
    new_memory_id: str
    scanned_count: int = 0
    contradictions_found: int = 0
    auto_invalidated: int = 0
    manual_review_needed: int = 0
    contradictions: list[Contradiction] = field(default_factory=list)
    scan_duration_ms: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "new_memory_id": self.new_memory_id,
            "scanned_count": self.scanned_count,
            "contradictions_found": self.contradictions_found,
            "auto_invalidated": self.auto_invalidated,
            "manual_review_needed": self.manual_review_needed,
            "contradictions": [c.to_dict() for c in self.contradictions],
            "scan_duration_ms": self.scan_duration_ms,
        }


def _normalize_text(text: str) -> str:
    """Normalize text for comparison: lowercase, strip punctuation, collapse whitespace."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _word_overlap(text_a: str, text_b: str) -> float:
    """Compute Jaccard word overlap between two texts."""
    words_a = set(_normalize_text(text_a).split())
    words_b = set(_normalize_text(text_b).split())
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / max(1, len(union))


def _detect_negation_contradiction(text_a: str, text_b: str) -> float:
    """Detect if two texts are negations of each other.

    Returns confidence 0.0-1.0. Higher = more likely a contradiction.
    """
    norm_a = _normalize_text(text_a)
    norm_b = _normalize_text(text_b)

    # Check each negation pattern
    for pos_pattern, neg_pattern in _NEGATION_PATTERNS:
        # Check if one text has positive and the other has negative
        a_has_pos = bool(re.search(pos_pattern, norm_a))
        a_has_neg = bool(re.search(neg_pattern, norm_a))
        b_has_pos = bool(re.search(pos_pattern, norm_b))
        b_has_neg = bool(re.search(neg_pattern, norm_b))

        # One is positive, other is negative on the same concept
        if (a_has_pos and b_has_neg) or (a_has_neg and b_has_pos):
            # Additional check: most other words should overlap
            # (otherwise they're about different things)
            # Remove the negation words and compare
            clean_a = re.sub(neg_pattern, "", re.sub(pos_pattern, "", norm_a))
            clean_b = re.sub(neg_pattern, "", re.sub(pos_pattern, "", norm_b))
            remaining_overlap = _word_overlap(clean_a, clean_b)
            if remaining_overlap > 0.3:
                return min(0.95, 0.7 + remaining_overlap * 0.25)

    return 0.0


def _detect_temporal_contradiction(text_a: str, text_b: str) -> float:
    """Detect if one text explicitly supersedes the other with temporal signals.

    Returns confidence 0.0-1.0.
    """
    norm_a = _normalize_text(text_a)
    norm_b = _normalize_text(text_b)

    a_has_temporal = any(kw in norm_a for kw in _TEMPORAL_KEYWORDS)
    b_has_temporal = any(kw in norm_b for kw in _TEMPORAL_KEYWORDS)

    # Only one has temporal signals — the one WITH is likely newer
    if a_has_temporal != b_has_temporal:
        overlap = _word_overlap(text_a, text_b)
        if overlap > 0.4:
            return min(0.9, 0.6 + overlap * 0.3)

    return 0.0


class ContradictionDetector:
    """Automatic contradiction detection for agent memory.

    After a new memory is stored, scans existing memories for:
    1. Negation contradictions (X is true vs X is not true)
    2. Temporal contradictions (old fact vs updated fact)
    3. Semantic contradictions (high similarity but different claims)

    Auto-resolves high-confidence contradictions by tagging old memories
    as superseded. Low-confidence ones are flagged for manual review.
    """

    def __init__(
        self,
        memory_engine: Any,
        similarity_threshold: float = 0.60,
        negation_confidence_threshold: float = 0.70,
        auto_resolve_threshold: float = 0.85,
        max_scan_count: int = 50,
    ):
        self._memory = memory_engine
        self._similarity_threshold = similarity_threshold
        self._negation_confidence_threshold = negation_confidence_threshold
        self._auto_resolve_threshold = auto_resolve_threshold
        self._max_scan_count = max_scan_count

    def scan_after_store(self, new_record: Any) -> ContradictionScanResult:
        """Scan for contradictions after a new memory is stored.

        This is the main entry point. Call it after memory.store().
        """
        import time
        start = time.monotonic()

        result = ContradictionScanResult(new_memory_id=new_record.memory_id)

        # Search for semantically similar existing memories
        similar = self._memory.search(
            query=new_record.content or "",
            k=self._max_scan_count,
            threshold=self._similarity_threshold,
        )

        # Filter out the new memory itself, superseded memories, and pinned memories
        similar = [
            m for m in similar
            if m.memory_id != new_record.memory_id
            and not (getattr(m, "metadata", {}) or {}).get("superseded")
            and not getattr(m, "is_pinned", False)
        ]
        result.scanned_count = len(similar)

        for existing in similar:
            contradiction = self._check_contradiction(new_record, existing)
            if contradiction is not None:
                result.contradictions_found += 1
                result.contradictions.append(contradiction)

                if contradiction.auto_resolved:
                    result.auto_invalidated += 1
                else:
                    result.manual_review_needed += 1

        result.scan_duration_ms = int((time.monotonic() - start) * 1000)

        if result.contradictions_found > 0:
            logger.info(
                "Contradiction scan complete",
                new_id=new_record.memory_id,
                scanned=result.scanned_count,
                found=result.contradictions_found,
                auto_invalidated=result.auto_invalidated,
            )

        return result

    def _check_contradiction(self, new: Any, old: Any) -> Contradiction | None:
        """Check if two memories contradict each other."""
        new_content = new.content or ""
        old_content = old.content or ""

        if not new_content.strip() or not old_content.strip():
            return None

        # Skip if both are pinned (safety rules don't contradict)
        if getattr(new, "is_pinned", False) and getattr(old, "is_pinned", False):
            return None

        # 1. Check for negation contradiction
        negation_conf = _detect_negation_contradiction(new_content, old_content)
        if negation_conf >= self._negation_confidence_threshold:
            confidence = negation_conf
            # High confidence → auto-resolve
            auto_resolve = confidence >= self._auto_resolve_threshold
            resolution = "superseded" if auto_resolve else "manual_review"

            if auto_resolve:
                self._auto_supersede(old, new.memory_id, "negation_contradiction")

            return Contradiction(
                new_memory_id=new.memory_id,
                old_memory_id=old.memory_id,
                new_content=new_content,
                old_content=old_content,
                similarity=_word_overlap(new_content, old_content),
                contradiction_type="negation",
                confidence=confidence,
                auto_resolved=auto_resolve,
                resolution=resolution,
            )

        # 2. Check for temporal contradiction
        temporal_conf = _detect_temporal_contradiction(new_content, old_content)
        if temporal_conf >= self._negation_confidence_threshold:
            confidence = temporal_conf
            auto_resolve = confidence >= self._auto_resolve_threshold
            resolution = "superseded" if auto_resolve else "manual_review"

            if auto_resolve:
                self._auto_supersede(old, new.memory_id, "temporal_update")

            return Contradiction(
                new_memory_id=new.memory_id,
                old_memory_id=old.memory_id,
                new_content=new_content,
                old_content=old_content,
                similarity=_word_overlap(new_content, old_content),
                contradiction_type="temporal",
                confidence=confidence,
                auto_resolved=auto_resolve,
                resolution=resolution,
            )

        # 3. Check for semantic contradiction (high similarity + different importance/trust)
        overlap = _word_overlap(new_content, old_content)
        if overlap >= 0.7:
            # Very similar content — check if importance/trust differs significantly
            new_importance = getattr(new, "importance_score", 5.0)
            old_importance = getattr(old, "importance_score", 5.0)
            new_trust = getattr(new, "trust_level", 2)
            old_trust = getattr(old, "trust_level", 2)

            # If new memory is significantly more important/trusted, supersede old
            if new_importance > old_importance + 2.0 or new_trust > old_trust:
                confidence = min(0.9, 0.6 + (new_importance - old_importance) * 0.05)
                auto_resolve = confidence >= self._auto_resolve_threshold
                resolution = "superseded" if auto_resolve else "manual_review"

                if auto_resolve:
                    self._auto_supersede(old, new.memory_id, "higher_authority")

                return Contradiction(
                    new_memory_id=new.memory_id,
                    old_memory_id=old.memory_id,
                    new_content=new_content,
                    old_content=old_content,
                    similarity=overlap,
                    contradiction_type="semantic",
                    confidence=confidence,
                    auto_resolved=auto_resolve,
                    resolution=resolution,
                )

        return None

    def _auto_supersede(self, old_memory: Any, new_memory_id: str, reason: str) -> None:
        """Mark an old memory as superseded by a new one."""
        old_meta = getattr(old_memory, "metadata", {}) or {}
        old_meta["superseded"] = True
        old_meta["superseded_by"] = new_memory_id
        old_meta["superseded_at"] = datetime.now(UTC).isoformat()
        old_meta["superseded_reason"] = reason

        try:
            self._memory.apply_patch(old_memory.memory_id, [
                {"op": "replace", "path": "/metadata", "value": old_meta}
            ])
            # Also lower importance so it sinks in search results
            self._memory.reinforce(old_memory.memory_id, success=False)
        except Exception as exc:
            logger.warning(
                "Failed to auto-supersede memory",
                memory_id=old_memory.memory_id,
                error=str(exc),
            )

        # Log in audit trail (redact content to avoid leaking secrets)
        try:
            content_preview = (old_memory.content or "")[:100]
            # Basic redaction: mask likely secrets
            content_preview = re.sub(r"(api[_-]?key|secret|password|token)\s*[=:]\s*\S+", r"\1=***", content_preview, flags=re.IGNORECASE)
            self._memory.store_audit(
                action="contradiction_auto_supersede",
                details={
                    "superseded_id": old_memory.memory_id,
                    "superseded_by": new_memory_id,
                    "reason": reason,
                    "old_content_preview": content_preview,
                },
            )
        except Exception:
            logger.warning("Failed to log supersede to audit trail")

    def scan_all(self, agent_id: str | None = None) -> list[ContradictionScanResult]:
        """Scan ALL memories for existing contradictions (batch mode).

        Useful for initial setup or periodic maintenance.
        """
        agent_id = agent_id or self._memory.agent_id
        all_memories = self._memory.list_all(namespace_scope="own")
        results = []

        for _i, mem in enumerate(all_memories):
            # Only scan non-pinned, non-superseded memories
            meta = getattr(mem, "metadata", {}) or {}
            if meta.get("superseded") or getattr(mem, "is_pinned", False):
                continue

            result = self.scan_after_store(mem)
            if result.contradictions_found > 0:
                results.append(result)

        return results
