from __future__ import annotations

import os
from collections.abc import Callable
from typing import Any

try:
    from opentelemetry import trace
    from opentelemetry.trace import SpanKind

    _has_otel_api = True
except ImportError:
    _has_otel_api = False
    SpanKind = None  # type: ignore[assignment,misc]

try:
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

    _has_otel_sdk = True
except ImportError:
    _has_otel_sdk = False

from bastion.memory import BastionMemory
from bastion.models import AuditEntry, ClusterInfo, MemoryRecord


def setup_otel(
    service_name: str = "bastion",
    exporter=None,
):
    if not _has_otel_sdk:
        return None
    if exporter is None:
        otel_endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
        if otel_endpoint:
            try:
                from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

                exporter = OTLPSpanExporter(endpoint=otel_endpoint)
            except ImportError:
                pass
        if exporter is None:
            exporter = ConsoleSpanExporter()
    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    return trace.get_tracer(service_name, "0.1.0")


def get_tracer(name: str = "bastion"):
    if _has_otel_api:
        return trace.get_tracer(name, "0.1.0")
    return _NullTracer()


class _NullTracer:
    def __init__(self):
        self._exported: list[_NullSpan] = []

    def start_as_current_span(self, name, **kwargs):
        span = _NullSpan(name)
        self._exported.append(span)
        return span

    def start_span(self, name, **kwargs):
        span = _NullSpan(name)
        self._exported.append(span)
        return span


class _NullSpan:
    def __init__(self, name: str = ""):
        self.name = name

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def set_attribute(self, key, value):
        pass

    def set_status(self, status):
        pass

    def record_exception(self, exception):
        pass

    def end(self):
        pass


class _NullContext:
    def __enter__(self):
        return None

    def __exit__(self, *args):
        pass


class TracedBastionMemory:
    """OpenTelemetry-instrumented wrapper around BastionMemory."""

    def __init__(self, memory: BastionMemory):
        self._memory = memory
        self._tracer = trace.get_tracer("bastion-memory", "0.1.0") if _has_otel_api else _NullTracer()

    def _span(self, name: str, attrs: dict[str, Any] | None = None):
        if _has_otel_api:
            return self._tracer.start_as_current_span(name, kind=SpanKind.CLIENT, attributes=attrs or {})
        return self._tracer.start_as_current_span(name)

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

    def reinforce(self, memory_id: str, success: bool = True) -> dict:
        with self._span("bastion.reinforce", {"memory_id": memory_id, "success": success}):
            return self._memory.reinforce(memory_id, success)

    def search(
        self,
        query: str,
        k: int = 5,
        threshold: float = 0.8,
        memory_type: str | None = None,
        namespace_scope: str = "own",
    ) -> list[MemoryRecord]:
        with self._span("bastion.search", {"k": k, "threshold": threshold, "namespace_scope": namespace_scope}):
            return self._memory.search(query, k, threshold, memory_type, namespace_scope)

    def list_all(
        self,
        memory_type: str | None = None,
        namespace_scope: str = "own",
    ) -> list[MemoryRecord]:
        with self._span("bastion.list_all", {"namespace_scope": namespace_scope}):
            return self._memory.list_all(memory_type, namespace_scope)

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

    def store_with_graph(
        self,
        content: str,
        metadata: dict[str, Any] | None = None,
        expires_in_seconds: int | None = None,
    ) -> tuple[MemoryRecord, list, list]:
        with self._span("bastion.store_with_graph"):
            return self._memory.store_with_graph(content, metadata, expires_in_seconds)

    def graph_query(
        self,
        start_entity: str,
        relation_path: list[str] | None = None,
        hops: int = 2,
    ) -> list[dict[str, Any]]:
        with self._span("bastion.graph_query", {"start_entity": start_entity, "hops": hops}):
            return self._memory.graph_query(start_entity, relation_path, hops)

    def graph_at_time(self, timestamp: str, entity: str | None = None) -> dict[str, Any]:
        with self._span("bastion.graph_at_time", {"timestamp": timestamp}):
            return self._memory.graph_at_time(timestamp, entity)

    def graph_stats(self) -> dict[str, Any]:
        with self._span("bastion.graph_stats"):
            return self._memory.graph_stats()

    def broadcast(
        self,
        event_type: str,
        payload: dict | None = None,
        namespace: str | None = None,
    ) -> Any:
        with self._span("bastion.broadcast", {"event_type": event_type}):
            return self._memory.broadcast(event_type, payload, namespace)

    def poll_messages(self, namespace: str | None = None) -> list:
        with self._span("bastion.poll_messages"):
            return self._memory.poll_messages(namespace)

    def get_memory(self, memory_id: str) -> MemoryRecord | None:
        with self._span("bastion.get_memory"):
            return self._memory.get_memory(memory_id)

    def provision_cluster(self, name: str, region: str = "us-east1", provider: str = "aws") -> ClusterInfo:
        with self._span("bastion.provision_cluster", {"region": region, "provider": provider}):
            return self._memory.provision_cluster(name, region, provider)

    def close(self) -> None:
        self._memory.close()

    # ── Missing method proxies (added to close API surface gap) ──

    def delete_memory(self, memory_id: str) -> bool:
        with self._span("bastion.delete_memory", {"memory_id": memory_id}):
            return self._memory.delete_memory(memory_id)

    def correct_memory(self, memory_id: str, new_content: str) -> MemoryRecord | None:
        with self._span("bastion.correct_memory", {"memory_id": memory_id}):
            return self._memory.correct_memory(memory_id, new_content)

    def list_memories(
        self,
        memory_type: str | None = None,
        limit: int = 50,
        cursor: str | None = None,
    ) -> list[MemoryRecord]:
        with self._span("bastion.list_memories", {"limit": limit, "cursor": cursor or ""}):
            return self._memory.list_memories(memory_type, limit, cursor)

    def apply_patch(self, memory_id: str, patch_ops: list[dict]) -> MemoryRecord | None:
        with self._span("bastion.apply_patch", {"memory_id": memory_id}):
            return self._memory.apply_patch(memory_id, patch_ops)

    def pin(self, memory_id: str, priority: int = 5, reason: str = "") -> bool:
        with self._span("bastion.pin", {"memory_id": memory_id, "priority": priority}):
            return self._memory.pin(memory_id, priority, reason)

    def unpin(self, memory_id: str) -> bool:
        with self._span("bastion.unpin", {"memory_id": memory_id}):
            return self._memory.unpin(memory_id)

    def get_pinned(self, min_priority: int = 1) -> list[MemoryRecord]:
        with self._span("bastion.get_pinned", {"min_priority": min_priority}):
            return self._memory.get_pinned(min_priority)

    def list_recent(self, hours: int = 24, limit: int = 200) -> list[MemoryRecord]:
        with self._span("bastion.list_recent", {"hours": hours, "limit": limit}):
            return self._memory.list_recent(hours, limit)

    def list_pinned(self) -> list[MemoryRecord]:
        with self._span("bastion.list_pinned"):
            return self._memory.list_pinned()

    def list_by_importance(self, min_importance: float = 5.0, limit: int = 100) -> list[MemoryRecord]:
        with self._span("bastion.list_by_importance", {"min_importance": min_importance, "limit": limit}):
            return self._memory.list_by_importance(min_importance, limit)

    def keyword_search(self, keyword: str, limit: int = 50) -> list[MemoryRecord]:
        with self._span("bastion.keyword_search", {"limit": limit}):
            return self._memory.keyword_search(keyword, limit)

    def count_by_agent(self) -> int:
        with self._span("bastion.count_by_agent"):
            return self._memory.count_by_agent()
