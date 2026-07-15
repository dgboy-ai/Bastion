"""Observations / Meta-Pattern Detection for agent memory.

Scans agent memory collections to detect recurring patterns, co-occurrences,
and meta-observations across sessions. Inspired by Zep's "Observations"
feature — the only competitor that surfaces global patterns beyond individual
facts.

Usage:
    detector = ObservationDetector(memory_engine)
    observations = detector.detect()
    for obs in observations:
        print(f"[{obs.pattern_type}] {obs.description} (confidence: {obs.confidence})")
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


@dataclass
class Observation:
    """A detected pattern or meta-observation across agent memories."""
    observation_id: str = ""
    pattern_type: str = ""  # "recurring_theme", "co_occurrence", "temporal_trend", "entity_cluster"
    description: str = ""
    confidence: float = 0.0
    supporting_memories: list[str] = field(default_factory=list)
    frequency: int = 0
    detected_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "observation_id": self.observation_id,
            "pattern_type": self.pattern_type,
            "description": self.description,
            "confidence": round(self.confidence, 4),
            "supporting_memories": self.supporting_memories,
            "frequency": self.frequency,
            "detected_at": self.detected_at,
            "metadata": self.metadata,
        }


@dataclass
class ObservationReport:
    """Full report of detected observations."""
    agent_id: str = ""
    total_memories_scanned: int = 0
    observations: list[Observation] = field(default_factory=list)
    detected_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "total_memories_scanned": self.total_memories_scanned,
            "observations": [o.to_dict() for o in self.observations],
            "detected_at": self.detected_at,
        }


# Common stop words to exclude from theme extraction
_STOP_WORDS = frozenset({
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "each",
    "every", "both", "few", "more", "most", "other", "some", "such", "no",
    "not", "only", "own", "same", "so", "than", "too", "very", "just",
    "and", "but", "or", "if", "while", "that", "this", "it", "its",
})


def _extract_ngrams(text: str, n: int = 2) -> list[str]:
    """Extract word n-grams from text."""
    words = [w.lower() for w in re.findall(r"\w+", text) if w.lower() not in _STOP_WORDS and len(w) > 2]
    if len(words) < n:
        return [" ".join(words)] if words else []
    return [" ".join(words[i:i + n]) for i in range(len(words) - n + 1)]


def _extract_entities(text: str) -> list[str]:
    """Extract likely entity names (capitalized words, technical terms)."""
    # Match capitalized words (including PascalCase like CockroachDB)
    entities = re.findall(r"\b[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*\b", text)
    # Also match technical patterns
    tech = re.findall(r"\b(?:API|SQL|HTTP|REST|CRDB|C-SPANN|MCP|A2A|CDC|RLS|GDPR|HIPAA|SOC2|AWS|GCP|KMS)\b", text)
    return list(set(entities + tech))


class ObservationDetector:
    """Detects meta-patterns and observations across agent memory.

    Scans the full memory collection to find:
    1. Recurring themes (frequent topics/keywords)
    2. Co-occurrences (entities that appear together)
    3. Temporal trends (topics that increase/decrease over time)
    4. Entity clusters (groups of related entities)
    """

    def __init__(
        self,
        memory_engine: Any,
        min_frequency: int = 3,
        min_confidence: float = 0.5,
        max_observations: int = 20,
    ):
        self._memory = memory_engine
        self._min_frequency = min_frequency
        self._min_confidence = min_confidence
        self._max_observations = max_observations

    def detect(self) -> ObservationReport:
        """Run full observation detection across all agent memories."""
        agent_id = self._memory.agent_id
        all_memories = self._memory.list_all(namespace_scope="own")

        report = ObservationReport(
            agent_id=agent_id,
            total_memories_scanned=len(all_memories),
        )

        if len(all_memories) < self._min_frequency:
            return report

        # Cap at 500 memories to prevent O(n²) performance issues
        if len(all_memories) > 500:
            all_memories = all_memories[:500]

        # 1. Recurring themes
        themes = self._detect_recurring_themes(all_memories)
        report.observations.extend(themes)

        # 2. Co-occurrences
        cooccs = self._detect_co_occurrences(all_memories)
        report.observations.extend(cooccs)

        # 3. Temporal trends
        trends = self._detect_temporal_trends(all_memories)
        report.observations.extend(trends)

        # 4. Entity clusters
        clusters = self._detect_entity_clusters(all_memories)
        report.observations.extend(clusters)

        # Sort by confidence and limit
        report.observations.sort(key=lambda o: o.confidence, reverse=True)
        report.observations = report.observations[:self._max_observations]

        logger.info(
            "Observation detection complete",
            agent_id=agent_id,
            scanned=len(all_memories),
            observations=len(report.observations),
        )

        return report

    def _detect_recurring_themes(self, memories: list[Any]) -> list[Observation]:
        """Find frequently occurring topics/keywords across memories."""
        bigram_counter: Counter[str] = Counter()
        bigram_memories: dict[str, list[str]] = defaultdict(list)

        for mem in memories:
            content = mem.content or ""
            ngrams = _extract_ngrams(content, n=2)
            for ng in ngrams:
                bigram_counter[ng] += 1
                if mem.memory_id not in bigram_memories[ng]:
                    bigram_memories[ng].append(mem.memory_id)

        observations = []
        for theme, count in bigram_counter.most_common(10):
            if count < self._min_frequency:
                continue
            confidence = min(0.95, 0.5 + (count / max(1, len(memories))) * 2)
            if confidence < self._min_confidence:
                continue
            observations.append(Observation(
                observation_id=f"theme-{hash(theme) & 0xFFFFFF:06x}",
                pattern_type="recurring_theme",
                description=f"Recurring theme: \"{theme}\" appears in {count} memories",
                confidence=confidence,
                supporting_memories=bigram_memories[theme][:5],
                frequency=count,
                metadata={"theme": theme},
            ))

        return observations

    def _detect_co_occurrences(self, memories: list[Any]) -> list[Observation]:
        """Find entities that frequently appear together."""
        entity_pairs: Counter[tuple[str, ...]] = Counter()
        pair_memories: dict[tuple[str, ...], list[str]] = defaultdict(list)

        for mem in memories:
            entities = _extract_entities(mem.content or "")
            if len(entities) < 2:
                continue
            # Generate pairs
            for i, e1 in enumerate(entities):
                for e2 in entities[i + 1:]:
                    pair = tuple(sorted([e1, e2]))
                    entity_pairs[pair] += 1
                    if mem.memory_id not in pair_memories[pair]:
                        pair_memories[pair].append(mem.memory_id)

        observations = []
        for pair, count in entity_pairs.most_common(10):
            if count < self._min_frequency:
                continue
            confidence = min(0.9, 0.5 + count * 0.1)
            if confidence < self._min_confidence:
                continue
            observations.append(Observation(
                observation_id=f"cooc-{hash(pair) & 0xFFFFFF:06x}",
                pattern_type="co_occurrence",
                description=f"\"{pair[0]}\" and \"{pair[1]}\" co-occur in {count} memories",
                confidence=confidence,
                supporting_memories=pair_memories[pair][:5],
                frequency=count,
                metadata={"entity_a": pair[0], "entity_b": pair[1]},
            ))

        return observations

    def _detect_temporal_trends(self, memories: list[Any]) -> list[Observation]:
        """Detect topics that are increasing or decreasing over time."""
        now = datetime.now(UTC)
        recent_themes: Counter[str] = Counter()
        old_themes: Counter[str] = Counter()

        for mem in memories:
            created = mem.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            age_hours = (now - created).total_seconds() / 3600

            ngrams = _extract_ngrams(mem.content or "", n=2)
            if age_hours < 24:
                for ng in ngrams:
                    recent_themes[ng] += 1
            elif age_hours > 72:
                for ng in ngrams:
                    old_themes[ng] += 1

        observations = []
        for theme, recent_count in recent_themes.most_common(10):
            old_count = old_themes.get(theme, 0)
            if recent_count >= self._min_frequency and recent_count > old_count * 2:
                confidence = min(0.85, 0.5 + (recent_count - old_count) * 0.05)
                if confidence >= self._min_confidence:
                    observations.append(Observation(
                        observation_id=f"trend-{hash(theme) & 0xFFFFFF:06x}",
                        pattern_type="temporal_trend",
                        description=(
                            f"Emerging trend: \"{theme}\" increased from "
                            f"{old_count} to {recent_count} occurrences"
                        ),
                        confidence=confidence,
                        frequency=recent_count,
                        metadata={"theme": theme, "recent_count": recent_count, "old_count": old_count},
                    ))

        return observations

    def _detect_entity_clusters(self, memories: list[Any]) -> list[Observation]:
        """Group related entities that appear across multiple memories."""
        entity_memories: dict[str, list[str]] = defaultdict(list)

        for mem in memories:
            entities = _extract_entities(mem.content or "")
            for e in entities:
                if mem.memory_id not in entity_memories[e]:
                    entity_memories[e].append(mem.memory_id)

        # Find entities that appear in multiple memories
        frequent_entities = {
            e: mems for e, mems in entity_memories.items()
            if len(mems) >= self._min_frequency
        }

        observations = []
        for entity, mems in sorted(frequent_entities.items(), key=lambda x: len(x[1]), reverse=True)[:5]:
            confidence = min(0.9, 0.5 + len(mems) * 0.05)
            if confidence >= self._min_confidence:
                observations.append(Observation(
                    observation_id=f"entity-{hash(entity) & 0xFFFFFF:06x}",
                    pattern_type="entity_cluster",
                    description=f"Entity \"{entity}\" appears across {len(mems)} memories",
                    confidence=confidence,
                    supporting_memories=mems[:5],
                    frequency=len(mems),
                    metadata={"entity": entity},
                ))

        return observations
