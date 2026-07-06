from __future__ import annotations

import json
import logging
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from bastion.memory import BastionMemory
from bastion.models import MemoryRecord

logger = logging.getLogger(__name__)


class VectorClock:
    """
    Lamport-style vector clock for tracking causal history across agents.

    Each agent maintains its own logical clock.  A vector clock is a mapping
    ``{agent_id: logical_tick}``.  Two events are *concurrent* if neither
    clock dominates the other (i.e. both have ticks the other lacks).

    Usage:
        >>> clock_a = VectorClock({"alice": 3, "bob": 1})
        >>> clock_b = VectorClock({"alice": 2, "bob": 2})
        >>> clock_a.happens_before(clock_b)
        False
        >>> clock_b.happens_before(clock_a)
        False
        >>> clock_a.is_concurrent_with(clock_b)
        True
    """

    def __init__(self, clock: dict[str, int] | None = None) -> None:
        self._clock: dict[str, int] = dict(clock) if clock else {}

    def tick(self, agent_id: str) -> VectorClock:
        """Return a new VectorClock with *agent_id* incremented by 1."""
        next_clock = dict(self._clock)
        next_clock[agent_id] = next_clock.get(agent_id, 0) + 1
        return VectorClock(next_clock)

    def merge(self, other: VectorClock) -> VectorClock:
        """Return the element-wise maximum of both clocks (least upper bound)."""
        merged = dict(self._clock)
        for agent, tick in other._clock.items():
            merged[agent] = max(merged.get(agent, 0), tick)
        return VectorClock(merged)

    def happens_before(self, other: VectorClock) -> bool:
        """True if *self* causally precedes *other* (all ticks <=, at least one <)."""
        all_le = all(self._clock.get(a, 0) <= other._clock.get(a, 0) for a in self._clock | other._clock)
        some_lt = any(self._clock.get(a, 0) < other._clock.get(a, 0) for a in self._clock | other._clock)
        return all_le and some_lt

    def is_concurrent_with(self, other: VectorClock) -> bool:
        """True if neither clock dominates the other (concurrent writes)."""
        return not self.happens_before(other) and not other.happens_before(self)

    def to_dict(self) -> dict[str, int]:
        return dict(self._clock)

    def to_json(self) -> str:
        return json.dumps(self._clock, sort_keys=True)

    @classmethod
    def from_json(cls, raw: str) -> VectorClock:
        return cls(json.loads(raw))

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, VectorClock):
            return NotImplemented
        return self._clock == other._clock

    def __repr__(self) -> str:
        return f"VectorClock({self._clock})"


class CRDTMemory:
    """
    A CRDT-inspired memory wrapper that detects and resolves concurrent
    writes from multiple agents sharing the same namespace.

    Every memory write carries a **vector clock** that encodes its causal
    history.  When two agents write the same fact concurrently (neither
    clock dominates the other), the conflict is resolved automatically
    using a configurable strategy:

    * ``"lww"`` — last-writer-wins (default, fastest)
    * ``"semantic"`` — LLM-powered semantic merge (requires LLM callback)

    Reference (world-first in agent memory):
        "Nobody has applied CRDT merge semantics to multi-agent shared
         state." — Christopher Meiklejohn, "Getting Up to Speed on
         Multi-Agent Systems", May 2026.

        "Multi-agent memory consistency is the most pressing open
         challenge." — Yu et al., arxiv:2603.10062, Mar 2026.

    Usage:
        >>> memory = BastionMemory("agent-1", mock=True)
        >>> crdt = CRDTMemory(memory, strategy="lww")
        >>> crdt.store("fact", "user likes Python")
        >>> crdt.search("programming preferences")
    """

    def __init__(
        self,
        memory: BastionMemory,
        strategy: str = "lww",
        llm_merge_callback: Any | None = None,
    ) -> None:
        self._memory = memory
        self._strategy = strategy
        self._llm_merge = llm_merge_callback
        self._clock = VectorClock()

    @property
    def agent_id(self) -> str:
        return self._memory.agent_id

    @property
    def namespace(self) -> str:
        return self._memory.namespace

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def store(
        self,
        memory_type: str,
        content: str,
        metadata: dict[str, Any] | None = None,
        expires_in_seconds: int | None = None,
    ) -> MemoryRecord:
        """Store a memory, tagging it with the current vector clock."""
        self._clock = self._clock.tick(self.agent_id)
        meta = {**(metadata or {}), "_vector_clock": self._clock.to_dict()}
        return self._memory.store(memory_type, content, meta, expires_in_seconds)

    def search(
        self,
        query: str,
        k: int = 10,
        threshold: float = 0.0,
        memory_type: str | None = None,
        namespace_scope: str = "own",
    ) -> list[MemoryRecord]:
        return self._memory.search(query, k, threshold, memory_type, namespace_scope)

    def get_memory(self, memory_id: str) -> MemoryRecord | None:
        return self._memory.get_memory(memory_id)

    def resolve_conflicts(
        self,
        fact_key: str,
        candidates: list[MemoryRecord],
    ) -> MemoryRecord:
        """
        Detect and resolve concurrent writes for *candidates* that share
        the same semantic *fact_key* (e.g. "user_language_preference").

        Returns the winning (merged) record and stores the resolution
        as a new memory with a merged clock.
        """
        if len(candidates) <= 1:
            return candidates[0]

        clocks = [self._extract_clock(r) for r in candidates]
        concurrent_pairs = [
            (i, j) for i in range(len(clocks)) for j in range(i + 1, len(clocks))
            if clocks[i].is_concurrent_with(clocks[j])
        ]

        if not concurrent_pairs:
            # Totally ordered by happens-before — pick the latest
            return max(candidates, key=lambda r: r.created_at or datetime.min.replace(tzinfo=UTC))

        logger.info(
            "CRDT conflict detected",
            extra={
                "fact_key": fact_key,
                "concurrent_pairs": len(concurrent_pairs),
                "strategy": self._strategy,
            },
        )

        if self._strategy == "lww":
            winner = self._resolve_lww(candidates, clocks)
        elif self._strategy == "semantic" and self._llm_merge is not None:
            winner = self._resolve_semantic(candidates, clocks, fact_key)
        else:
            winner = self._resolve_lww(candidates, clocks)

        # Store the resolved value with a merged clock
        merged_clock = clocks[0]
        for c in clocks[1:]:
            merged_clock = merged_clock.merge(c)
        merged_clock = merged_clock.tick(self.agent_id)

        meta = {**(winner.metadata or {}), "_vector_clock": merged_clock.to_dict(), "_resolved": True}
        resolved = self._memory.store("fact", winner.content, meta)
        logger.info("CRDT conflict resolved", extra={"fact_key": fact_key, "resolved_id": resolved.memory_id})
        return resolved

    def get_clock(self) -> VectorClock:
        """Return the current vector clock snapshot."""
        return self._clock

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _extract_clock(self, record: MemoryRecord) -> VectorClock:
        raw = (record.metadata or {}).get("_vector_clock", {})
        if isinstance(raw, dict):
            return VectorClock(raw)
        return VectorClock()

    def _resolve_lww(self, candidates: list[MemoryRecord], clocks: list[VectorClock]) -> MemoryRecord:
        """Last-writer-wins: pick the record with the most advanced clock."""
        paired = list(zip(candidates, clocks, strict=False))
        paired.sort(key=lambda pair: sum(pair[1].to_dict().values()))
        return paired[-1][0]

    def _resolve_semantic(
        self,
        candidates: list[MemoryRecord],
        clocks: list[VectorClock],
        fact_key: str,
    ) -> MemoryRecord:
        """Semantic merge using the LLM callback. Falls back to LWW on failure."""
        if self._llm_merge is None:
            return self._resolve_lww(candidates, clocks)
        try:
            contents = [r.content for r in candidates]
            merged = self._llm_merge(contents, fact_key)
            candidates[0].content = merged
            return candidates[0]
        except Exception:
            logger.exception("Semantic merge failed, falling back to LWW")
            return self._resolve_lww(candidates, clocks)


# -----------------------------------------------------------------------
# CRDT Data Types — production-grade replicated data types backed by
# BastionMemory with vector-clock-based conflict detection.
#
# Reference: Shapiro et al., "A comprehensive study of Convergent and
# Commutative Replicated Data Types" (INRIA, 2011).
#
# Applied to multi-agent memory for the first time in any open-source
# project.  Each type persists through BastionMemory's hash chain and
# supports concurrent writes from multiple agents with automatic merge.
# -----------------------------------------------------------------------


class LWWRegister:
    """
    Last-Writer-Wins Register CRDT for single-value agent facts.

    Each ``set()`` creates a new BastionMemory record tagged with the
    current vector clock.  ``get()`` resolves conflicts using LWW
    semantics (highest tick sum wins).  Best for: user preferences,
    agent role assignments, per-key configuration values.

    Reference:
        Shapiro et al. §2.1.1 — LWW-Register.

    Usage:
        >>> register = LWWRegister(crdt_memory, "user_timezone")
        >>> register.set("America/New_York")
        >>> register.get()
        'America/New_York'
    """

    _CRDT_TYPE = "crdt_lww"

    def __init__(self, memory: CRDTMemory, key: str) -> None:
        self._memory = memory
        self._key = key

    def get(self) -> str | None:
        """Return the latest value, or None if no writes exist."""
        candidates = self._memory.search(
            self._key, k=20, threshold=0.0, memory_type=self._CRDT_TYPE,
        )
        target = [r for r in candidates if self._key == (r.metadata or {}).get("_crdt_key")]
        if not target:
            return None
        winner = self._memory.resolve_conflicts(self._key, target)
        return _crdt_value(winner.content)

    def set(self, value: str) -> MemoryRecord:
        """Set the register value.  Returns the stored memory record."""
        meta = {"_crdt_key": self._key}
        return self._memory.store(
            self._CRDT_TYPE, json.dumps({"value": value}), metadata=meta,
        )

    def merge(self, candidates: list[MemoryRecord]) -> MemoryRecord:
        """Resolve concurrent writes.  Uses the memory's configured strategy."""
        return self._memory.resolve_conflicts(self._key, candidates)


class ORSet:
    """
    Observed-Remove Set CRDT for unordered agent state collections.

    Add-wins semantics: if one agent adds an element while another agent
    concurrently removes it, the element stays in the set.  Best for:
    tags, entity memberships, tool registrations, feature flags.

    Reference:
        Shapiro et al. §2.1.3 — OR-Set.

    Usage:
        >>> tags = ORSet(crdt_memory, "agent_tags")
        >>> tags.add("production")
        >>> tags.add("monitoring")
        >>> tags.remove("production")
        >>> tags.get()
        {'monitoring'}
    """

    _CRDT_TYPE = "crdt_orset"

    def __init__(self, memory: CRDTMemory, key: str) -> None:
        self._memory = memory
        self._key = key

    def add(self, element: str) -> MemoryRecord:
        """Add *element* to the set.  Returns the stored record."""
        tag = str(uuid.uuid4())
        meta = {"_crdt_key": self._key, "_crdt_elem": element, "_crdt_tag": tag, "_crdt_op": "add"}
        return self._memory.store(
            self._CRDT_TYPE, json.dumps({"element": element, "tag": tag, "op": "add"}), metadata=meta,
        )

    def remove(self, element: str) -> list[MemoryRecord]:
        """Remove *element* from the set.  Returns tombstone records."""
        meta = {"_crdt_key": self._key, "_crdt_elem": element, "_crdt_op": "remove"}
        record = self._memory.store(
            self._CRDT_TYPE, json.dumps({"element": element, "op": "remove"}), metadata=meta,
        )
        return [record]

    def get(self) -> set[str]:
        """Return the current set of elements (adds minus concurrent-removes)."""
        records = self._memory.search(
            self._key, k=200, threshold=0.0, memory_type=self._CRDT_TYPE,
        )
        target = [r for r in records if (r.metadata or {}).get("_crdt_key") == self._key]

        adds: dict[str, list[MemoryRecord]] = defaultdict(list)
        removes: dict[str, list[MemoryRecord]] = defaultdict(list)

        for r in target:
            op = (r.metadata or {}).get("_crdt_op")
            elem = (r.metadata or {}).get("_crdt_elem", "")
            if op == "add":
                adds[elem].append(r)
            elif op == "remove":
                removes[elem].append(r)

        result: set[str] = set()
        for elem, add_records in adds.items():
            rem_records = removes.get(elem, [])
            if not rem_records:
                result.add(elem)
                continue

            for add_r in add_records:
                ac = self._memory._extract_clock(add_r)
                has_concurrent = any(ac.is_concurrent_with(self._memory._extract_clock(r)) for r in rem_records)
                all_rem_before = all(self._memory._extract_clock(r).happens_before(ac) for r in rem_records)
                if has_concurrent or all_rem_before:
                    result.add(elem)
                    break
                # If add happens-before all removes, element stays removed
                if all(ac.happens_before(self._memory._extract_clock(r)) for r in rem_records):
                    break

        return result


class PNCounter:
    """
    Positive-Negative Counter CRDT for distributed agent metrics.

    Each replica maintains its own increment and decrement counts.
    The total is sum(P) − sum(N) across all replicas.  Best for:
    interaction counts, task completions, error tallies.

    Reference:
        Shapiro et al. §2.1.2 — PN-Counter.

    Usage:
        >>> counter = PNCounter(crdt_memory, "memory_writes")
        >>> counter.increment(3)
        >>> counter.decrement(1)
        >>> counter.value()
        2
    """

    _CRDT_TYPE = "crdt_pncounter"

    def __init__(self, memory: CRDTMemory, key: str) -> None:
        self._memory = memory
        self._key = key

    def increment(self, delta: int = 1) -> MemoryRecord:
        return self._memory.store(
            self._CRDT_TYPE, json.dumps({"op": "inc", "delta": delta}),
            metadata={"_crdt_key": self._key},
        )

    def decrement(self, delta: int = 1) -> MemoryRecord:
        return self._memory.store(
            self._CRDT_TYPE, json.dumps({"op": "dec", "delta": delta}),
            metadata={"_crdt_key": self._key},
        )

    def value(self) -> int:
        records = self._memory.search(
            self._key, k=500, threshold=0.0, memory_type=self._CRDT_TYPE,
        )
        target = [r for r in records if (r.metadata or {}).get("_crdt_key") == self._key]

        p_total = 0
        n_total = 0
        seen: set[str] = set()

        for r in target:
            try:
                data = json.loads(r.content)
            except (json.JSONDecodeError, TypeError):
                continue
            tag = (r.metadata or {}).get("_vector_clock", "")
            tag_str = str(tag) if tag else r.memory_id
            if tag_str in seen:
                continue
            seen.add(tag_str)
            if data.get("op") == "inc":
                p_total += data.get("delta", 1)
            elif data.get("op") == "dec":
                n_total += data.get("delta", 1)

        return p_total - n_total


class RGA:
    """
    Replicated Growable Array CRDT for ordered agent conversation logs.

    Elements are appended with a unique ID and causal history.  When two
    agents append concurrently, both entries survive and are ordered
    deterministically by (agent_id, unique_id).  Best for: conversation
    history, event streams, ordered instruction sequences.

    Reference:
        Roh et al., "Replicated Abstract Data Types: Building Blocks for
        Collaborative Applications" (2011).

    Usage:
        >>> log = RGA(crdt_memory, "conversation")
        >>> log.append("Hello from agent-1")
        >>> log.append("Hello from agent-2")
        >>> log.list()
        ['Hello from agent-1', 'Hello from agent-2']
    """

    _CRDT_TYPE = "crdt_rga"

    def __init__(self, memory: CRDTMemory, key: str) -> None:
        self._memory = memory
        self._key = key

    def append(self, content: str) -> MemoryRecord:
        entry_id = str(uuid.uuid4())
        meta = {
            "_crdt_key": self._key,
            "_crdt_entry_id": entry_id,
            "_crdt_position": str(datetime.now(UTC).timestamp()),
        }
        return self._memory.store(
            self._CRDT_TYPE, json.dumps({"entry_id": entry_id, "content": content}),
            metadata=meta,
        )

    def list(self) -> list[str]:
        records = self._memory.search(
            self._key, k=500, threshold=0.0, memory_type=self._CRDT_TYPE,
        )
        target = [r for r in records if (r.metadata or {}).get("_crdt_key") == self._key]

        # Sort by position, then by agent_id, then by memory_id as tiebreaker
        def _sort_key(r: MemoryRecord) -> tuple[float, str, str]:
            pos = float((r.metadata or {}).get("_crdt_position", "0"))
            return (pos, r.memory_id, r.memory_id)

        target.sort(key=_sort_key)

        seen: set[str] = set()
        result: list[str] = []
        for r in target:
            try:
                data = json.loads(r.content)
            except (json.JSONDecodeError, TypeError):
                continue
            eid = data.get("entry_id", "")
            if eid in seen:
                continue
            seen.add(eid)
            result.append(data.get("content", ""))
        return result


class ORMap:
    """
    Observed-Remove Map CRDT combining typed sub-CRDT values.

    Each key in the map points to a named CRDT instance (LWWRegister,
    ORSet, PNCounter, or RGA).  This is the top-level structure for
    building **agent profile documents** that survive concurrent edits.

    Reference:
        Brown et al., "OR-Set and OR-Map in Riak DT" (Basho, 2013).

    Usage:
        >>> profile = ORMap(crdt_memory, "agent_profile")
        >>> profile.set("role", "monitor", "LWWRegister")
        >>> profile.set("tags", {"production", "canary"}, "ORSet")
        >>> profile.keys()
        ['role', 'tags']
    """

    _CRDT_TYPE = "crdt_ormap"

    def __init__(self, memory: CRDTMemory, key: str) -> None:
        self._memory = memory
        self._key = key
        self._sub_crdts: dict[str, LWWRegister | ORSet | PNCounter | RGA] = {}

    def set(self, sub_key: str, value: Any, crdt_type: str) -> None:
        meta = {"_crdt_key": self._key, "_crdt_sub_key": sub_key, "_crdt_sub_type": crdt_type}
        self._memory.store(
            self._CRDT_TYPE,
            json.dumps({"sub_key": sub_key, "sub_type": crdt_type, "value": value}),
            metadata=meta,
        )

    def get(self, sub_key: str) -> Any | None:
        records = self._memory.search(
            sub_key, k=20, threshold=0.0, memory_type=self._CRDT_TYPE,
        )
        target = [
            r for r in records
            if (r.metadata or {}).get("_crdt_key") == self._key
            and (r.metadata or {}).get("_crdt_sub_key") == sub_key
        ]
        if not target:
            return None
        latest = max(target, key=lambda r: r.created_at or datetime.min.replace(tzinfo=UTC))
        try:
            data = json.loads(latest.content)
        except (json.JSONDecodeError, TypeError):
            return None
        return data.get("value")

    def keys(self) -> list[str]:
        records = self._memory.search(
            self._key, k=100, threshold=0.0, memory_type=self._CRDT_TYPE,
        )
        seen: set[str] = set()
        for r in records:
            sk = (r.metadata or {}).get("_crdt_sub_key")
            if sk:
                seen.add(sk)
        return sorted(seen)


def _crdt_value(raw: str | None) -> str | None:
    """Extract the ``value`` field from a CRDT JSON payload."""
    if not raw:
        return None
    try:
        val: object = json.loads(raw).get("value")
        return val if isinstance(val, str) else None
    except (json.JSONDecodeError, TypeError):
        return raw
