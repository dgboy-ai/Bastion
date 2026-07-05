from __future__ import annotations

from collections.abc import Callable
from typing import Any

try:
    from opentelemetry import trace
    from opentelemetry.trace import SpanKind

    _has_otel = True
except ImportError:
    _has_otel = False

from bastion.memory import BastionMemory
from bastion.models import AuditEntry, ClusterInfo, MemoryRecord


class _NullContext:
    def __enter__(self):
        return None

    def __exit__(self, *args):
        pass


class TracedBastionMemory:
    def __init__(self, memory: BastionMemory):
        self._memory = memory
        self._tracer = trace.get_tracer("bastion-memory", "0.1.0") if _has_otel else None

    def _span(self, name: str, attrs: dict[str, Any] | None = None):
        if self._tracer:
            return self._tracer.start_as_current_span(name, kind=SpanKind.CLIENT, attributes=attrs or {})
        return _NullContext()

    @property
    def agent_id(self) -> str:
        return self._memory.agent_id

    def store(
        self,
        memory_type: str,
        content: str,
        metadata: dict[str, Any] | None = None,
        expires_in_seconds: int | None = None,
    ) -> MemoryRecord:
        with self._span("bastion.store", {"memory_type": memory_type, "content_length": len(content)}):
            return self._memory.store(memory_type, content, metadata, expires_in_seconds)

    def search(
        self,
        query: str,
        k: int = 5,
        threshold: float = 0.8,
        memory_type: str | None = None,
    ) -> list[MemoryRecord]:
        with self._span("bastion.search", {"k": k, "threshold": threshold}):
            return self._memory.search(query, k, threshold, memory_type)

    def get_at_time(self, timestamp: str, agent_id: str | None = None) -> list[MemoryRecord]:
        with self._span("bastion.get_at_time", {"timestamp": timestamp}):
            return self._memory.get_at_time(timestamp, agent_id)

    def audit(self, agent_id: str | None = None) -> list[AuditEntry]:
        with self._span("bastion.audit"):
            return self._memory.audit(agent_id)

    def heal(self, agent_id: str | None = None) -> dict[str, Any]:
        with self._span("bastion.heal"):
            return self._memory.heal(agent_id)

    def resolve_conflict(self, fact_a: str, fact_b: str, context: str | None = None) -> str:
        with self._span("bastion.resolve_conflict"):
            return self._memory.resolve_conflict(fact_a, fact_b, context)

    def query_with_cache(
        self,
        query: str,
        llm_callback: Callable[[str], str],
        memory_type: str = "semantic_cache",
        threshold: float = 0.97,
    ) -> tuple[str, dict]:
        with self._span("bastion.query_with_cache", {"memory_type": memory_type, "threshold": threshold}):
            return self._memory.query_with_cache(query, llm_callback, memory_type, threshold)

    def detect_anomalies(self, agent_id: str | None = None) -> list[dict]:
        with self._span("bastion.detect_anomalies"):
            return self._memory.detect_anomalies(agent_id)

    def diff(self, timestamp_a: str, timestamp_b: str, agent_id: str | None = None) -> dict:
        with self._span("bastion.diff"):
            return self._memory.diff(timestamp_a, timestamp_b, agent_id)

    def provision_cluster(self, name: str, region: str = "us-east1", provider: str = "aws") -> ClusterInfo:
        with self._span("bastion.provision_cluster", {"region": region, "provider": provider}):
            return self._memory.provision_cluster(name, region, provider)

    def close(self) -> None:
        self._memory.close()
