"""Observation Detector — detect recurring themes, entity clusters, and meta-patterns.

Scans all agent memories to surface global patterns beyond individual facts.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from bastion.log_setup import get_logger

if TYPE_CHECKING:
    from bastion.memory import BastionMemory

logger = get_logger(__name__)


@dataclass
class Observation:
    pattern_type: str
    description: str
    frequency: int
    entities: list[str]
    confidence: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "pattern_type": self.pattern_type,
            "description": self.description,
            "frequency": self.frequency,
            "entities": self.entities,
            "confidence": round(self.confidence, 3),
        }


@dataclass
class ObservationReport:
    agent_id: str
    observations: list[Observation]
    total_memories_scanned: int
    unique_entities: int
    dominant_topics: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "observations": [o.to_dict() for o in self.observations],
            "total_memories_scanned": self.total_memories_scanned,
            "unique_entities": self.unique_entities,
            "dominant_topics": self.dominant_topics,
        }


class ObservationDetector:
    """Detect recurring themes and meta-patterns across agent memories."""

    def __init__(self, memory: BastionMemory):
        self._mem = memory

    def detect(self) -> ObservationReport:
        """Scan all memories and detect patterns."""
        # Fetch all memories
        all_memories = self._mem.list_memories(limit=500)
        if not all_memories:
            return ObservationReport(
                agent_id=self._mem.agent_id,
                observations=[],
                total_memories_scanned=0,
                unique_entities=0,
                dominant_topics=[],
            )

        # Extract entities and content
        entity_counter: Counter = Counter()
        word_counter: Counter = Counter()
        type_counter: Counter = Counter()
        all_entities: list[str] = []

        for mem in all_memories:
            content = mem.content
            memory_type = getattr(mem, "memory_type", "unknown")
            type_counter[memory_type] += 1

            # Extract entities (capitalized words, emails, etc.)
            entities = self._extract_entities(content)
            all_entities.extend(entities)
            for e in entities:
                entity_counter[e] += 1

            # Extract words for topic detection
            words = re.findall(r"[a-z]{4,}", content.lower())
            word_counter.update(words)

        # Detect patterns
        observations: list[Observation] = []

        # 1. Frequent entities (appear in 3+ memories)
        for entity, count in entity_counter.most_common(10):
            if count >= 3:
                observations.append(Observation(
                    pattern_type="frequent_entity",
                    description=f"Entity '{entity}' appears in {count} memories",
                    frequency=count,
                    entities=[entity],
                    confidence=min(count / max(len(all_memories), 1), 1.0),
                ))

        # 2. Dominant topics (high-frequency words)
        stop_words = {
            "this", "that", "with", "from", "have", "been", "were", "they",
            "their", "what", "when", "where", "which", "about", "would",
            "could", "should", "there", "these", "those", "into", "also",
            "than", "some", "only", "very", "more", "most", "other", "each",
            "just", "like", "over", "such", "after", "before", "being",
        }
        topics = [
            (w, c) for w, c in word_counter.most_common(20)
            if w not in stop_words and c >= 3
        ][:5]
        dominant_topics = [w for w, _ in topics]

        for word, count in topics:
            observations.append(Observation(
                pattern_type="dominant_topic",
                description=f"Topic '{word}' appears in {count} memories",
                frequency=count,
                entities=[word],
                confidence=min(count / max(len(all_memories), 1), 1.0),
            ))

        # 3. Memory type distribution (detect imbalance)
        for mtype, count in type_counter.items():
            if count > len(all_memories) * 0.7 and len(all_memories) > 5:
                observations.append(Observation(
                    pattern_type="type_imbalance",
                    description=f"Memory type '{mtype}' dominates with {count}/{len(all_memories)} memories",
                    frequency=count,
                    entities=[mtype],
                    confidence=count / len(all_memories),
                ))

        # 4. Duplicate detection
        contents = [m.content for m in all_memories]
        dupes = len(contents) - len(set(contents))
        if dupes > 0:
            observations.append(Observation(
                pattern_type="duplicates",
                description=f"Found {dupes} duplicate memory contents",
                frequency=dupes,
                entities=[],
                confidence=min(dupes / max(len(all_memories), 1), 1.0),
            ))

        return ObservationReport(
            agent_id=self._mem.agent_id,
            observations=observations,
            total_memories_scanned=len(all_memories),
            unique_entities=len(set(all_entities)),
            dominant_topics=dominant_topics,
        )

    def _extract_entities(self, content: str) -> list[str]:
        entities = []
        for match in re.finditer(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b", content):
            entities.append(match.group(1))
        for match in re.finditer(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b", content):
            entities.append(match.group(0))
        return entities
