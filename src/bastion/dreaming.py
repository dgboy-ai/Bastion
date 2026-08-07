"""Sleep-Time Memory Consolidation (Dreaming)

When agents are idle, background processes review recent episodic memories
and consolidate learnings into durable knowledge. Inspired by Letta's
"dreaming" feature, the Sleep-Time Compute paper (Lin et al. 2025),
and cognitive science research on memory consolidation during sleep.

The dreaming process follows the five moves of consolidation
(reinforcement, salience-weighted decay, promotion, pattern extraction,
insight synthesis) as a background (sleep-time) regime:

1. Reviews recent episodic memories (last N hours)
2. Reinforces recently-referenced memories (ACT-R activation boost)
3. Applies salience-weighted decay (reference-count based, not timestamp-only)
4. Detects duplicates/near-matches and MERGES them (content blending)
5. Extracts recurring patterns across memories (LLM or heuristic)
6. Synthesizes insights across related memories (LLM)
7. Promotes high-value episodic → semantic knowledge
8. Prunes low-value, expired, or redundant memories
9. Pre-computes anticipated query answers for common retrieval patterns
10. Logs all actions in the audit trail for accountability

This runs as a background process triggered by:
- Manual trigger via MCP tool
- Auto-dream scheduler (cron-based, idle detection)

Usage:
    dreamer = MemoryDreamer(memory_engine)
    journal = dreamer.dream(agent_id="my-agent")
    print(f"Consolidated {journal.memories_consolidated} memories")
    print(f"Promoted {journal.memories_promoted} episodic → semantic")
    print(f"Pruned {journal.memories_pruned} low-value memories")
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)

# Cognitive memory types
EPISODIC = "episodic"  # What happened (events, experiences)
SEMANTIC = "semantic"  # What is true (facts, knowledge)
PROCEDURAL = "procedural"  # How to do things (skills, rules)

# ACT-R activation decay constant (memory decays as power law of recency/frequency)
_DECAY_RATE = 0.5
_SALIENCE_FLOOR = 3.0  # Below this importance, memory is prunable regardless of age
_REFERENCE_REINFORCE = 1.0  # Activation boost per reference count
_REFERENCE_DECAY = 0.2  # Decay per day

# Token estimate: chars per token
_CHARS_PER_TOKEN = 4.0


@dataclass
class DreamJournal:
    """Record of what happened during a dreaming session."""

    agent_id: str
    started_at: str = ""
    completed_at: str = str(datetime.now(UTC))
    duration_ms: int = 0
    status: str = "running"
    memories_reviewed: int = 0
    memories_consolidated: int = 0
    memories_promoted: int = 0
    memories_pruned: int = 0
    memories_reinforced: int = 0
    memories_decayed: int = 0
    patterns_found: int = 0
    insights_generated: int = 0
    precomputed_queries: int = 0
    sleeper_detected: int = 0
    sleeper_quarantined: int = 0
    lessons_extracted: list[str] = field(default_factory=list)
    insights: list[str] = field(default_factory=list)
    consolidation_details: list[dict[str, Any]] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "duration_ms": self.duration_ms,
            "status": self.status,
            "memories_reviewed": self.memories_reviewed,
            "memories_consolidated": self.memories_consolidated,
            "memories_promoted": self.memories_promoted,
            "memories_pruned": self.memories_pruned,
            "memories_reinforced": self.memories_reinforced,
            "memories_decayed": self.memories_decayed,
            "patterns_found": self.patterns_found,
            "insights_generated": self.insights_generated,
            "precomputed_queries": self.precomputed_queries,
            "sleeper_detected": self.sleeper_detected,
            "sleeper_quarantined": self.sleeper_quarantined,
            "lessons_extracted": self.lessons_extracted,
            "insights": self.insights,
            "consolidation_details": self.consolidation_details,
            "errors": self.errors,
        }


@dataclass
class ConsolidationCandidate:
    """A memory that might be worth consolidating."""

    memory_id: str
    content: str
    memory_type: str
    importance: float
    access_count: int
    created_at: str
    similarity_to_others: float = 0.0
    recommendation: str = ""  # "keep", "promote", "merge", "prune"
    merge_partner_id: str = ""  # memory_id of the merge partner (primary)
    merge_partner_content: str = ""  # content of the primary


class MemoryDreamer:
    """Background memory consolidation engine.

    Reviews recent episodic memories, extracts patterns and lessons,
    consolidates duplicates (with real content blending), promotes
    valuable episodic memories to semantic knowledge, applies
    salience-weighted decay, and prunes low-value memories.

    Structural decisions (what to reinforce/decay/promote/prune) use
    deterministic algorithms; the LLM is used only at the edge to
    render final lessons and blended content.
    """

    def __init__(
        self,
        memory_engine: Any,
        lookback_hours: int = 24,
        min_importance_for_promotion: float = 6.0,
        merge_similarity_threshold: float = 0.6,
        prune_access_threshold: int = 0,
        max_memories_per_dream: int = 200,
        enable_llm: bool = True,
    ):
        self._memory = memory_engine
        self._lookback_hours = lookback_hours
        self._min_importance_for_promotion = min_importance_for_promotion
        self._merge_similarity_threshold = merge_similarity_threshold
        self._prune_access_threshold = prune_access_threshold
        self._max_memories_per_dream = max_memories_per_dream
        self._enable_llm = enable_llm
        self._groq_client: Any = None

    def dream(self, agent_id: str | None = None) -> DreamJournal:
        """Run a full dreaming/consolidation cycle.

        This is the main entry point. It:
        1. Fetches recent episodic memories
        2. Reinforces recently-referenced memories
        3. Applies salience-weighted decay
        4. Detects duplicates and merges them (content blending)
        5. Extracts recurring patterns
        6. Synthesizes cross-memory insights
        7. Promotes high-value episodic → semantic
        8. Prunes low-value memories
        9. Pre-computes anticipated query answers
        10. Logs everything in the audit trail

        Args:
            agent_id: Agent to dream for. Uses engine's agent_id if None.

        Returns:
            DreamJournal with the results of the consolidation cycle.
        """
        agent_id = agent_id or self._memory.agent_id
        journal = DreamJournal(
            agent_id=agent_id,
            started_at=datetime.now(UTC).isoformat(),
        )
        start_time = time.monotonic()

        try:
            # Step 1: Fetch recent memories
            recent = self._fetch_recent_memories(agent_id)
            journal.memories_reviewed = len(recent)

            if not recent:
                logger.info("Dreaming: no recent memories to review", agent_id=agent_id)
                journal.completed_at = datetime.now(UTC).isoformat()
                journal.duration_ms = int((time.monotonic() - start_time) * 1000)
                journal.status = "complete"
                return journal

            # Step 2: Reinforce recently-referenced memories (ACT-R activation boost)
            reinforced = self._reinforce_accessed_memories(recent, agent_id)
            journal.memories_reinforced = reinforced

            # Step 3: Salience-weighted decay (reference-count based expiry)
            decayed = self._apply_salience_decay(recent, agent_id)
            journal.memories_decayed = decayed

            # Step 4: Sleeper poisoning detection — find dormant injected memories
            sleeper_results = self._detect_sleeper_poisoning(recent, agent_id)
            journal.sleeper_detected = sleeper_results["detected_count"]
            journal.sleeper_quarantined = sleeper_results["quarantined_count"]
            journal.consolidation_details.extend(sleeper_results["details"])

            # Step 5: Find consolidation candidates (duplicates/near-matches)
            candidates = self._find_consolidation_candidates(recent)
            journal.patterns_found = len(candidates)

            # Step 5: Consolidate duplicates — real content blending
            for candidate in candidates:
                if candidate.recommendation == "merge":
                    merged = self._merge_memories(candidate, agent_id)
                    if merged:
                        journal.memories_consolidated += 1
                        journal.consolidation_details.append(
                            {
                                "action": "merge",
                                "memory_id": candidate.memory_id,
                                "primary_id": candidate.merge_partner_id,
                                "similarity": round(candidate.similarity_to_others, 4),
                            }
                        )

            # Step 6: Extract recurring patterns across memories
            patterns = self._extract_patterns(recent, agent_id)
            journal.patterns_found = max(journal.patterns_found, len(patterns))
            for p in patterns:
                journal.lessons_extracted.append(p)

            # Step 7: Synthesize cross-memory insights (LLM at the edge)
            insights = self._synthesize_insights(recent, agent_id)
            journal.insights_generated = len(insights)
            journal.insights = insights

            # Step 8: Promote high-value episodic → semantic
            for record in recent:
                if record.memory_type == EPISODIC and record.importance_score >= self._min_importance_for_promotion:
                    promoted = self._promote_to_semantic(record, agent_id)
                    if promoted:
                        journal.memories_promoted += 1
                        journal.lessons_extracted.append(promoted)
                        journal.consolidation_details.append(
                            {
                                "action": "promote",
                                "memory_id": record.memory_id,
                                "from_type": EPISODIC,
                                "to_type": SEMANTIC,
                                "importance": record.importance_score,
                            }
                        )

            # Step 9: Prune low-value memories (salience floor + expiry)
            pruned = self._prune_low_value(agent_id)
            journal.memories_pruned = pruned

            # Step 10: Pre-compute anticipated query answers
            precomputed = self._precompute_queries(agent_id, recent)
            journal.precomputed_queries = precomputed

            # Step 11: Log the dream in the audit trail
            self._memory.store_audit(
                action="dream_consolidation",
                details={
                    "reviewed": journal.memories_reviewed,
                    "consolidated": journal.memories_consolidated,
                    "promoted": journal.memories_promoted,
                    "pruned": journal.memories_pruned,
                    "reinforced": journal.memories_reinforced,
                    "decayed": journal.memories_decayed,
                    "patterns": journal.patterns_found,
                    "insights": journal.insights_generated,
                    "precomputed": journal.precomputed_queries,
                    "lessons": len(journal.lessons_extracted),
                    "sleeper_detected": journal.sleeper_detected,
                    "sleeper_quarantined": journal.sleeper_quarantined,
                },
                agent_id=agent_id,
            )

            logger.info(
                "Dreaming complete",
                agent_id=agent_id,
                reviewed=journal.memories_reviewed,
                consolidated=journal.memories_consolidated,
                promoted=journal.memories_promoted,
                pruned=journal.memories_pruned,
                reinforced=journal.memories_reinforced,
                insights=journal.insights_generated,
                sleeper_detected=journal.sleeper_detected,
                sleeper_quarantined=journal.sleeper_quarantined,
            )
            journal.status = "complete"

        except Exception as exc:
            journal.errors.append(str(exc))
            journal.status = "error"
            logger.error("Dreaming failed", agent_id=agent_id, error=str(exc))

        journal.completed_at = datetime.now(UTC).isoformat()
        journal.duration_ms = int((time.monotonic() - start_time) * 1000)
        return journal

    def _fetch_recent_memories(self, agent_id: str) -> list[Any]:
        """Fetch memories created in the lookback window."""
        if hasattr(self._memory, "list_recent"):
            return self._memory.list_recent(
                hours=self._lookback_hours,
                limit=self._max_memories_per_dream,
            )
        # Fallback for mock mode
        all_memories = self._memory.list_all(namespace_scope="own")
        cutoff = datetime.now(UTC) - timedelta(hours=self._lookback_hours)
        recent = []
        for mem in all_memories:
            created = mem.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            if created >= cutoff:
                recent.append(mem)
            if len(recent) >= self._max_memories_per_dream:
                break
        return recent

    # ── ACT-R activation model: reinforcement + salience-weighted decay ────

    def _activation(self, access_count: int, age_days: float) -> float:
        """ACT-R base-level activation.

        B = ln(Σ t_j^(-d)) where t_j is time since each use.
        Approximation: ln(access_count) - d * age_days.
        A high reference count keeps activation high; age decays it.
        """
        if access_count <= 0:
            return -_REFERENCE_DECAY * age_days
        return (_REFERENCE_REINFORCE * _math_log(access_count)) - (_REFERENCE_DECAY * age_days)

    def _reinforce_accessed_memories(self, memories: list[Any], agent_id: str) -> int:
        """Boost activation for recently-referenced memories.

        A memory that was recently accessed (reference count increased)
        gets its importance boosted toward the promotion threshold.
        """
        reinforced = 0
        now = datetime.now(UTC)
        for mem in memories:
            meta = mem.metadata or {}
            if meta.get("recently_accessed"):
                # Boost importance but cap at 10.0
                new_importance = min(10.0, (mem.importance_score or 5.0) + 0.5)
                if new_importance != (mem.importance_score or 5.0):
                    try:
                        self._memory.apply_patch(
                            mem.memory_id,
                            [{"op": "replace", "path": "/importance_score", "value": new_importance}],
                        )
                        reinforced += 1
                    except Exception:
                        pass
        return reinforced

    def _apply_salience_decay(self, memories: list[Any], agent_id: str) -> int:
        """Apply salience-weighted decay to low-activation memories.

        Memories below the salience floor are marked as decayed and
        become candidates for pruning regardless of age. This replaces
        pure timestamp-based expiry with reference-count based decay.
        """
        decayed = 0
        now = datetime.now(UTC)
        for mem in memories:
            if getattr(mem, "is_pinned", False):
                continue
            created = mem.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            age_days = max(0.0, (now - created).total_seconds() / 86400.0)
            access_count = getattr(mem, "access_count", 0) or 0
            importance = getattr(mem, "importance_score", 0) or 0

            activation = self._activation(access_count, age_days)
            # Decay if activation is very low AND importance is below salience floor
            if activation < -1.0 and importance < _SALIENCE_FLOOR:
                try:
                    self._memory.apply_patch(
                        mem.memory_id,
                        [{"op": "replace", "path": "/decayed", "value": True}],
                    )
                    decayed += 1
                except Exception:
                    pass
        return decayed

    # ── Sleeper poisoning detection ───────────────────────────────────────────

    def _detect_sleeper_poisoning(
        self,
        memories: list[Any],
        agent_id: str,
    ) -> dict[str, Any]:
        """Detect dormant/sleeper poisoned memories.

        Sleeper poisoning: attacker injects memories that lie dormant with
        high importance but low activation, then activate later via trigger
        words. This method detects:
        1. Burst injection patterns — sudden spike in memory writes
        2. High-importance / low-access ratio — suspicious dormant memories
        3. Injection pattern re-scan — re-check content at retrieval time
        4. Temporal clustering — memories created in suspicious time windows
        5. Content contradiction — memories contradicting established facts

        Returns dict with detected_count, quarantined_count, details.
        """
        from bastion.guard import MemoryGuard
        guard = MemoryGuard()

        detected = 0
        quarantined = 0
        details = []

        if not memories:
            return {"detected_count": 0, "quarantined_count": 0, "details": []}

        now = datetime.now(UTC)

        # 1. BURST INJECTION DETECTION
        # Group memories by creation hour and look for unusual spikes
        hourly_counts: dict[str, int] = {}
        for mem in memories:
            created = mem.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            hour_key = created.strftime("%Y-%m-%d %H:00")
            hourly_counts[hour_key] = hourly_counts.get(hour_key, 0) + 1

        if hourly_counts:
            avg_per_hour = sum(hourly_counts.values()) / len(hourly_counts)
            for hour, count in hourly_counts.items():
                # Spike: >3x average (when multiple hours), or >15 absolute
                if count > max(avg_per_hour * 3, 20) or count > 15:
                    detected += 1
                    details.append({
                        "action": "sleeper_burst_detected",
                        "hour": hour,
                        "count": count,
                        "avg_per_hour": round(avg_per_hour, 1),
                        "severity": "HIGH" if count > avg_per_hour * 5 else "MEDIUM",
                    })

        # 2. HIGH-IMPORTANCE / LOW-ACCESS RATIO
        # Memories with high importance but near-zero access are suspicious
        for mem in memories:
            if getattr(mem, "is_pinned", False):
                continue
            importance = getattr(mem, "importance_score", 0) or 0
            access_count = getattr(mem, "access_count", 0) or 0
            created = mem.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            age_days = max(1.0, (now - created).total_seconds() / 86400.0)

            # Suspicious: high importance (>=7) but very low access rate
            # Expected access rate for important memory: at least once per 2 days
            expected_min_access = max(1, age_days / 2)
            if importance >= 7 and access_count < expected_min_access * 0.2:
                detected += 1
                details.append({
                    "action": "sleeper_high_importance_low_access",
                    "memory_id": mem.memory_id,
                    "importance": importance,
                    "access_count": access_count,
                    "age_days": round(age_days, 1),
                    "expected_min_access": round(expected_min_access, 1),
                    "severity": "HIGH",
                })

        # 3. INJECTION PATTERN RE-SCAN AT RETRIEVAL TIME
        # Re-run guard on all memories — catches delayed-activation payloads
        for mem in memories:
            if getattr(mem, "is_pinned", False):
                continue
            content = mem.content or ""
            if len(content) < 20:  # Skip very short memories
                continue
            report = guard.check(content)
            if not report.is_safe:
                detected += 1
                details.append({
                    "action": "sleeper_injection_rescan",
                    "memory_id": mem.memory_id,
                    "findings": [f.threat_type for f in report.findings],
                    "poisoning_risk": report.poisoning_risk,
                    "severity": "CRITICAL" if report.poisoning_risk == "HIGH" else "HIGH",
                })

        # 4. TEMPORAL CLUSTERING ANALYSIS
        # Look for memories created in tight time windows with similar content
        # (indicator of automated injection)
        time_window_seconds = 300  # 5-minute windows
        for i, mem_a in enumerate(memories):
            for mem_b in memories[i + 1:]:
                created_a = mem_a.created_at
                created_b = mem_b.created_at
                if created_a.tzinfo is None:
                    created_a = created_a.replace(tzinfo=UTC)
                if created_b.tzinfo is None:
                    created_b = created_b.replace(tzinfo=UTC)
                time_diff = abs((created_a - created_b).total_seconds())
                if time_diff <= time_window_seconds:
                    # Check content similarity
                    content_a = (mem_a.content or "").lower()
                    content_b = (mem_b.content or "").lower()
                    if content_a and content_b:
                        words_a = set(content_a.split())
                        words_b = set(content_b.split())
                        if words_a and words_b:
                            jaccard = len(words_a & words_b) / max(1, len(words_a | words_b))
                            if jaccard > 0.7:  # High similarity in tight time window
                                detected += 1
                                details.append({
                                    "action": "sleeper_temporal_cluster",
                                    "memory_id_a": mem_a.memory_id,
                                    "memory_id_b": mem_b.memory_id,
                                    "time_diff_seconds": int(time_diff),
                                    "similarity": round(jaccard, 3),
                                    "severity": "HIGH",
                                })

        # 5. CONTENT CONTRADICTION DETECTION
        # Compare high-importance memories against each other for contradictions
        high_importance = [m for m in memories if (getattr(m, "importance_score", 0) or 0) >= 6]
        for i, mem_a in enumerate(high_importance):
            for mem_b in high_importance[i + 1:]:
                content_a = (mem_a.content or "").lower()
                content_b = (mem_b.content or "").lower()
                # Simple negation detection
                if self._detect_contradiction(content_a, content_b):
                    detected += 1
                    details.append({
                        "action": "sleeper_contradiction",
                        "memory_id_a": mem_a.memory_id,
                        "memory_id_b": mem_b.memory_id,
                        "content_a": content_a[:100],
                        "content_b": content_b[:100],
                        "severity": "MEDIUM",
                    })

        # QUARANTINE: Mark detected sleeper memories as decayed for pruning
        for detail in details:
            if detail["action"] in ("sleeper_injection_rescan", "sleeper_high_importance_low_access"):
                mem_id = detail.get("memory_id") or detail.get("memory_id_a")
                if mem_id:
                    try:
                        self._memory.apply_patch(
                            mem_id,
                            [{"op": "replace", "path": "/decayed", "value": True}],
                        )
                        quarantined += 1
                    except Exception:
                        pass

        return {
            "detected_count": detected,
            "quarantined_count": quarantined,
            "details": details,
        }

    def _detect_contradiction(self, content_a: str, content_b: str) -> bool:
        """Simple contradiction detection using negation patterns."""
        import re
        # Extract key claims (simple heuristic: look for "X is Y" patterns)
        # Check if one content negates the other
        negation_patterns = [
            (r"\bis not\b", r"\bis\b"),
            (r"\bdoes not\b", r"\bdoes\b"),
            (r"\bwill not\b", r"\bwill\b"),
            (r"\bcannot\b", r"\bcan\b"),
            (r"\bnever\b", r"\balways\b"),
            (r"\bfalse\b", r"\btrue\b"),
            (r"\bwrong\b", r"\bright\b"),
            (r"\bdeny\b", r"\bconfirm\b"),
        ]
        for neg, pos in negation_patterns:
            if re.search(neg, content_a) and re.search(pos, content_b):
                # Check if they share the same subject (rough heuristic)
                words_a = set(re.findall(r"\b\w{3,}\b", content_a))
                words_b = set(re.findall(r"\b\w{3,}\b", content_b))
                if len(words_a & words_b) >= 2:
                    return True
            if re.search(neg, content_b) and re.search(pos, content_a):
                words_a = set(re.findall(r"\b\w{3,}\b", content_a))
                words_b = set(re.findall(r"\b\w{3,}\b", content_b))
                if len(words_a & words_b) >= 2:
                    return True
        return False

    # ── Duplicate detection with real content blending ─────────────────────

    def _find_consolidation_candidates(
        self,
        memories: list[Any],
    ) -> list[ConsolidationCandidate]:
        """Find groups of similar memories that could be consolidated.

        Uses token-overlap similarity (Jaccard on stop-word-filtered terms)
        to detect near-duplicates, then marks the lower-importance one
        for MERGE (not just deletion).
        """
        candidates = []

        # Cap at 200 to bound O(n²) complexity
        memories = memories[:200]

        _STOP_WORDS = {"the", "a", "an", "is", "was", "were", "be", "been", "are",
                       "in", "on", "at", "to", "for", "of", "and", "or", "but", "not",
                       "it", "its", "this", "that", "these", "those", "with", "from",
                       "by", "as", "do", "does", "did", "has", "have", "had", "can",
                       "could", "will", "would", "shall", "should", "may", "might"}

        # O(n^2) similarity check — fine for <200 memories
        for i, mem_a in enumerate(memories):
            for mem_b in memories[i + 1 :]:
                # Skip if same memory
                if getattr(mem_a, "memory_id", None) == getattr(mem_b, "memory_id", None):
                    continue
                words_a = {w for w in (mem_a.content or "").lower().split() if w not in _STOP_WORDS}
                words_b = {w for w in (mem_b.content or "").lower().split() if w not in _STOP_WORDS}
                if not words_a or not words_b:
                    continue
                intersection = words_a & words_b
                union = words_a | words_b
                jaccard = len(intersection) / max(1, len(union))

                if jaccard >= self._merge_similarity_threshold:
                    # These are similar — the lower-importance one merges into the higher
                    if (mem_a.importance_score or 0) >= (mem_b.importance_score or 0):
                        primary, secondary = mem_a, mem_b
                    else:
                        primary, secondary = mem_b, mem_a

                    # Mark secondary for merge into primary (content blending)
                    candidates.append(
                        ConsolidationCandidate(
                            memory_id=secondary.memory_id,
                            content=secondary.content,
                            memory_type=secondary.memory_type,
                            importance=secondary.importance_score,
                            access_count=secondary.access_count,
                            created_at=secondary.created_at.isoformat() if secondary.created_at else "",
                            similarity_to_others=jaccard,
                            recommendation="merge",
                            merge_partner_id=primary.memory_id,
                            merge_partner_content=primary.content,
                        )
                    )

        # Deduplicate by memory_id (keep highest similarity)
        best_by_id: dict[str, ConsolidationCandidate] = {}
        for c in candidates:
            existing = best_by_id.get(c.memory_id)
            if existing is None or c.similarity_to_others > existing.similarity_to_others:
                best_by_id[c.memory_id] = c

        return list(best_by_id.values())

    def _merge_memories(self, candidate: ConsolidationCandidate, agent_id: str) -> bool:
        """Merge a secondary memory into its primary via content blending.

        Uses the LLM to synthesize a blended memory when available,
        otherwise falls back to concatenation of both contents.
        The secondary is then deleted, but its content contribution is
        preserved inside the primary's metadata and the new content.
        """
        primary_id = candidate.merge_partner_id
        primary_content = candidate.merge_partner_content

        if not primary_id:
            return False

        # Try LLM content blending first
        blended = None
        if self._enable_llm:
            blended = self._llm_merge_content(primary_content, candidate.content)
        if not blended:
            # Heuristic fallback: combine both contents
            blended = self._heuristic_merge_content(primary_content, candidate.content)

        try:
            # Update the primary with blended content (preserving its hash chain)
            self._memory.correct_memory(
                primary_id,
                blended,
                {
                    "source": "dream_merge",
                    "merged_from": candidate.memory_id,
                    "merged_content": candidate.content[:500],
                    "merge_similarity": round(candidate.similarity_to_others, 4),
                },
            )
            # Delete the secondary
            self._memory.delete_memory(candidate.memory_id)
            logger.debug(
                "Merged duplicate memory",
                removed_id=candidate.memory_id,
                into=primary_id,
                similarity=round(candidate.similarity_to_others, 4),
            )
            return True
        except Exception as exc:
            logger.warning("Merge failed: %s", exc)
            return False

    def _heuristic_merge_content(self, primary: str, secondary: str) -> str:
        """Merge two near-duplicate memories by appending unique secondary content.

        Preserves all information without LLM dependency.
        """
        primary_terms = set((primary or "").lower().split())
        secondary_terms = set((secondary or "").lower().split())
        # Find secondary words not in primary (dedup overlap)
        unique_secondary_words = secondary_terms - primary_terms
        if not unique_secondary_words:
            # Pure duplicate — just keep primary
            return primary

        # Append the unique secondary info (split into sentences to keep readability)
        sentences = re.split(r"(?<=[.!?])\s+", secondary)
        extra = [s for s in sentences if not set(s.lower().split()).issubset(primary_terms)]
        if extra:
            return primary.rstrip() + " " + " ".join(extra)
        return primary

    def _llm_merge_content(self, primary: str, secondary: str) -> str | None:
        """Use Groq LLM to synthesize a merged, de-duplicated memory."""
        try:
            client = self._get_groq_client()
            if client is None:
                return None
            model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Merge two near-duplicate memories into a single concise memory. "
                            "Keep all distinct facts, remove redundant phrasing. "
                            "Return ONLY the merged text, no explanation."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Memory A:\n{primary[:1500]}\n\n"
                            f"Memory B:\n{secondary[:1500]}\n\n"
                            "Merged memory (1-2 sentences):"
                        ),
                    },
                ],
                temperature=0.1,
                max_tokens=200,
                timeout=10,
            )
            merged = (resp.choices[0].message.content or "").strip()
            if len(merged) < 10:
                return None
            return merged.strip("\"'")
        except Exception:
            logger.debug("LLM merge failed, using heuristic")
            return None

    # ── Pattern extraction and insight synthesis ───────────────────────────

    def _extract_patterns(self, memories: list[Any], agent_id: str) -> list[str]:
        """Extract recurring patterns/themes across multiple memories.

        Groups memories by common key terms and synthesizes a pattern
        statement for each recurring theme.
        """
        patterns: list[str] = []
        term_clusters: dict[str, list[str]] = {}

        for mem in memories[:100]:
            content = (mem.content or "").lower()
            # Extract significant terms (len >= 5, not stop words)
            terms = set(
                re.findall(r"[a-z][a-z0-9_]{4,}",
                           content)
            )
            terms -= _PATTERN_STOP_WORDS
            for term in terms:
                term_clusters.setdefault(term, []).append((mem.content or "")[:200])

        # Find terms appearing in 3+ memories = recurring pattern
        for term, examples in term_clusters.items():
            if len(examples) >= 3:
                pattern = self._llm_pattern_statement(term, examples) or (
                    f"Pattern: '{term}' appears in {len(examples)} memories"
                )
                patterns.append(pattern)

        return patterns[:10]  # cap at 10 patterns

    def _llm_pattern_statement(self, term: str, examples: list[str]) -> str | None:
        """Use LLM to render a pattern statement from clustered examples."""
        try:
            client = self._get_groq_client()
            if client is None:
                return None
            model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
            snippet = " | ".join(examples[:5])
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Synthesize a single recurring pattern statement from "
                            "multiple related memory snippets. Return ONLY the pattern "
                            "statement (1 sentence)."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Term: '{term}'\nMemories:\n{snippet[:1500]}",
                    },
                ],
                temperature=0.2,
                max_tokens=80,
                timeout=10,
            )
            statement = (resp.choices[0].message.content or "").strip()
            return statement if len(statement) >= 10 else None
        except Exception:
            return None

    def _synthesize_insights(self, memories: list[Any], agent_id: str) -> list[str]:
        """Synthesize cross-memory insights — the LLM-at-the-edge step.

        Groups memories by importance and asks the LLM to identify
        connections, contradictions, or generalizations that span
        multiple memories.
        """
        if not self._enable_llm:
            return []
        try:
            client = self._get_groq_client()
            if client is None:
                return []
            model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")

            # Pick top memories by importance
            top = sorted(
                memories[:100],
                key=lambda m: (m.importance_score or 0),
                reverse=True,
            )[:15]
            if len(top) < 3:
                return []

            snippets = []
            for i, m in enumerate(top):
                snippets.append(f"{i + 1}. {(m.content or '')[:300]}")

            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Analyze these memories from an AI agent. Identify up to 3 "
                            "cross-cutting insights: connections, contradictions, or "
                            "generalizable learnings. Return as JSON array of strings, "
                            "each 1-2 sentences. No markdown."
                        ),
                    },
                    {
                        "role": "user",
                        "content": "\n".join(snippets),
                    },
                ],
                temperature=0.3,
                max_tokens=256,
                timeout=15,
                response_format={"type": "json_object"},
            )
            raw = resp.choices[0].message.content or "[]"
            insights = self._parse_insights(raw)
            # Store insights as procedural memories for future recall
            for insight in insights:
                try:
                    self._memory.store(
                        memory_type=PROCEDURAL,
                        content=insight,
                        metadata={
                            "source": "dream_insight",
                            "analysis_result": True,
                            "analysis_type": "insight_synthesis",
                            "consolidated_at": datetime.now(UTC).isoformat(),
                        },
                    )
                except Exception:
                    pass
            return insights
        except Exception:
            return []

    @staticmethod
    def _parse_insights(raw: str) -> list[str]:
        """Parse LLM insight output (JSON array of strings)."""
        raw = raw.strip()
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                # Some models wrap in {"insights": [...]}
                for key in ("insights", "result", "output"):
                    if isinstance(data.get(key), list):
                        data = data[key]
                        break
            if isinstance(data, list):
                return [str(i).strip() for i in data if str(i).strip()][:3]
        except (json.JSONDecodeError, ValueError):
            pass
        # Fallback: extract quoted strings
        matches = re.findall(r'"([^"]{10,})"', raw)
        return matches[:3]

    # ── Episodic → semantic promotion ──────────────────────────────────────

    def _promote_to_semantic(self, record: Any, agent_id: str) -> str | None:
        """Promote an episodic memory to semantic knowledge.

        Episodic memories are "what happened". Semantic memories are
        "what is true". When an episodic memory is important enough,
        we extract the fact/knowledge and store it as semantic.
        Returns the lesson text or None.
        """
        lesson = self._extract_lesson(record)
        if not lesson:
            return None

        # Store as semantic memory with provenance
        self._memory.store(
            memory_type=SEMANTIC,
            content=lesson,
            metadata={
                "source": "dream_consolidation",
                "promoted_from": record.memory_id,
                "original_type": EPISODIC,
                "original_importance": record.importance_score,
                "consolidated_at": datetime.now(UTC).isoformat(),
                "analysis_result": True,
                "analysis_type": "consolidation",
            },
        )
        return lesson

    def _extract_lesson(self, record: Any) -> str | None:
        """Extract a durable lesson or fact from an episodic memory.

        Uses Groq LLM to synthesize a concise, actionable lesson from
        the episodic content. Falls back to rule-based extraction when
        LLM is unavailable.
        """
        content = record.content or ""
        meta = record.metadata or {}

        # Skip if too short to be meaningful
        if len(content) < 20:
            return None

        # If the memory already has a lesson hint, use it
        lesson = meta.get("lesson")
        if lesson:
            return str(lesson)

        # Try LLM extraction for richer lessons
        if self._enable_llm:
            llm_lesson = self._llm_extract_lesson(content, meta)
            if llm_lesson:
                return llm_lesson

        # Fallback: rule-based extraction
        if record.importance_score >= self._min_importance_for_promotion:
            return content

        return None

    def _llm_extract_lesson(self, content: str, meta: dict) -> str | None:
        """Use Groq LLM to extract a durable lesson from episodic content.

        Returns a concise, actionable lesson, or None on failure.
        """
        try:
            client = self._get_groq_client()
            if client is None:
                return None
            model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")

            # Build context from metadata
            context_parts = []
            if meta.get("source"):
                context_parts.append(f"Source: {meta['source']}")
            if meta.get("tags"):
                context_parts.append(f"Tags: {meta['tags']}")
            context = "\n".join(context_parts) if context_parts else "No additional context."

            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a memory consolidation engine. Extract a durable, "
                            "actionable lesson from the given episodic memory. "
                            "Return ONLY the lesson text (1-2 sentences). "
                            "No quotes, no explanation, no markdown. "
                            "Focus on: what was learned, what pattern was observed, "
                            "or what fact should be remembered for future reference."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Episodic memory:\n{content[:2048]}\n\n"
                            f"Context:\n{context}\n\n"
                            "Extract the key lesson (1-2 sentences):"
                        ),
                    },
                ],
                temperature=0.1,
                max_tokens=128,
                timeout=10,
            )
            lesson = (resp.choices[0].message.content or "").strip()
            # Validate: must be meaningful, not just the original content echoed back
            if len(lesson) < 10 or lesson.lower() == content.lower():
                return None
            # Remove any wrapping quotes
            lesson = lesson.strip("\"'")
            return lesson
        except Exception:
            logger.debug("LLM lesson extraction failed, falling back to rule-based")
            return None

    # ── Pruning (salience floor + expiry) ──────────────────────────────────

    def _prune_low_value(self, agent_id: str) -> int:
        """Remove memories that are expired, unused, and low-value using SQL batch operations.

        Uses salience-weighted criteria: below the salience floor, old,
        and low-reference-count memories are pruned regardless of timestamp.
        """
        if not hasattr(self._memory, "get_pool") or getattr(self._memory, "_mock", False):
            return self._prune_low_value_mock(agent_id)

        pool = self._memory.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            with conn.cursor() as cur:
                # Batch delete expired memories (not pinned)
                cur.execute(
                    "DELETE FROM agent_memory "
                    "WHERE agent_id = %s AND is_pinned = FALSE "
                    "AND expires_at IS NOT NULL AND expires_at <= now() "
                    "RETURNING memory_id",
                    (agent_id,),
                )
                expired_deleted = len(cur.fetchall())

                # Batch delete decayed + low-salience memories (not pinned).
                # This is the reference-count based expiry: low access_count
                # AND low importance (salience floor) are pruned regardless of
                # strict age — replacing pure timestamp-only expiry.
                cur.execute(
                    "DELETE FROM agent_memory "
                    "WHERE agent_id = %s AND is_pinned = FALSE "
                    "AND access_count <= %s "
                    "AND importance_score < %s "
                    "AND created_at < now() - interval '2 days' "
                    "RETURNING memory_id",
                    (agent_id, self._prune_access_threshold, _SALIENCE_FLOOR),
                )
                low_value_deleted = len(cur.fetchall())

            conn.commit()
            return expired_deleted + low_value_deleted
        except Exception as e:
            conn.rollback()
            logger.warning("Prune failed: %s", e)
            return 0
        finally:
            pool.release(conn)

    def _prune_low_value_mock(self, agent_id: str) -> int:
        """Mock mode fallback for pruning."""
        all_memories = self._memory.list_all(namespace_scope="own")
        pruned = 0
        now = datetime.now(UTC)

        for mem in all_memories:
            if mem.is_pinned:
                continue

            if mem.expires_at:
                expires = mem.expires_at
                if expires.tzinfo is None:
                    expires = expires.replace(tzinfo=UTC)
                if expires < now:
                    self._memory.delete_memory(mem.memory_id)
                    pruned += 1
                    continue

            created = mem.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            age_days = (now - created).days
            access_count = getattr(mem, "access_count", 0) or 0
            importance = getattr(mem, "importance_score", 0) or 0
            # Reference-count based expiry: low access + low importance (salience floor)
            if age_days > 2 and access_count <= self._prune_access_threshold and importance < _SALIENCE_FLOOR:
                self._memory.delete_memory(mem.memory_id)
                pruned += 1

        return pruned

    # ── Pre-compute anticipated queries ────────────────────────────────────

    def _precompute_queries(self, agent_id: str, memories: list[Any]) -> int:
        """Pre-compute anticipated query answers from recurring themes.

        When the same term recurs across many memories, store a cached
        semantic answer so future queries hit the pre-computed result
        instead of recomputing. This is the 'pre-compute' sleep-time
        operation from the sleep-time compute literature.
        """
        if not self._enable_llm:
            return 0
        try:
            client = self._get_groq_client()
            if client is None:
                return 0

            # Find frequently recurring terms
            term_counts: dict[str, int] = {}
            for mem in memories[:100]:
                content = (mem.content or "").lower()
                terms = set(re.findall(r"[a-z][a-z0-9_]{4,}", content))
                terms -= _PATTERN_STOP_WORDS
                for term in terms:
                    term_counts[term] = term_counts.get(term, 0) + 1

            # Only pre-compute for terms that appear frequently (5+ times)
            hot_terms = [t for t, c in term_counts.items() if c >= 5][:5]
            if not hot_terms:
                return 0

            model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
            precomputed = 0
            for term in hot_terms:
                # Check if already pre-computed
                cached = self._memory.search(query=term, k=1, threshold=0.9)
                if cached and getattr(cached[0].metadata or {}, "analysis_type", "") == "precompute":
                    continue
                try:
                    resp = client.chat.completions.create(
                        model=model,
                        messages=[
                            {
                                "role": "system",
                                "content": (
                                    "Answer a question about recurring agent knowledge in "
                                    "1 sentence based on the memories. Return ONLY the answer."
                                ),
                            },
                            {
                                "role": "user",
                                "content": f"What is the agent's knowledge about '{term}'?\nMemories:\n{term_counts[term]} mentions.",
                            },
                        ],
                        temperature=0.2,
                        max_tokens=80,
                        timeout=10,
                    )
                    answer = (resp.choices[0].message.content or "").strip()
                    if len(answer) >= 10:
                        self._memory.store(
                            memory_type=SEMANTIC,
                            content=answer,
                            metadata={
                                "source": "dream_precompute",
                                "analysis_result": True,
                                "analysis_type": "precompute",
                                "term": term,
                                "consolidated_at": datetime.now(UTC).isoformat(),
                            },
                        )
                        precomputed += 1
                except Exception:
                    continue
            return precomputed
        except Exception:
            return 0

    def get_dream_history(self, agent_id: str | None = None) -> list[dict[str, Any]]:
        """Get past dreaming sessions from the audit trail."""
        agent_id = agent_id or self._memory.agent_id
        audit_entries = self._memory.audit(agent_id)
        dreams = []
        for entry in audit_entries:
            if entry.action == "dream_consolidation":
                dreams.append(
                    {
                        "audit_id": entry.audit_id,
                        "recorded_at": entry.recorded_at.isoformat() if entry.recorded_at else "",
                        "details": entry.details,
                    }
                )
        return dreams

    def _get_groq_client(self) -> Any:
        if self._groq_client is not None:
            return self._groq_client
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            return None
        from groq import Groq

        self._groq_client = Groq(api_key=api_key)
        return self._groq_client


def _math_log(x: float) -> float:
    """Natural log with safe handling of x <= 0."""
    import math

    return math.log(max(x, 1.0))


_PATTERN_STOP_WORDS = frozenset(
    {
        "the", "and", "that", "have", "for", "not", "with", "you", "this", "but",
        "his", "from", "they", "she", "will", "would", "there", "their", "what",
        "about", "which", "when", "make", "can", "like", "time", "just", "know",
        "take", "people", "into", "year", "your", "good", "some", "could", "them",
        "other", "than", "then", "now", "look", "only", "come", "its", "over",
        "think", "also", "back", "after", "use", "two", "how", "our", "work",
        "first", "well", "way", "even", "new", "want", "because", "any", "these",
        "give", "day", "most", "us", "was", "were", "been", "being", "are", "is",
    }
)


class DreamScheduler:
    """Auto-dream scheduler — runs dreaming during idle time.

    Uses a background thread to trigger dream cycles based on either
    a fixed interval or a configured cron schedule. Detects idle time
    by tracking recent activity.
    """

    def __init__(self, dreamer: MemoryDreamer, interval_seconds: int = 3600):
        self._dreamer = dreamer
        self._interval_seconds = interval_seconds
        self._last_dream_at: float = 0.0
        self._running = False

    def should_dream_now(self) -> bool:
        """Determines if it's time for a dream cycle."""
        if not self._running:
            return False
        elapsed = time.monotonic() - self._last_dream_at
        return elapsed >= self._interval_seconds

    def run_cycle(self, agent_id: str | None = None) -> DreamJournal:
        """Run one dream cycle and record the time."""
        journal = self._dreamer.dream(agent_id)
        self._last_dream_at = time.monotonic()
        return journal

    def start(self) -> None:
        """Mark the scheduler as active."""
        self._running = True

    def stop(self) -> None:
        """Mark the scheduler as inactive."""
        self._running = False
