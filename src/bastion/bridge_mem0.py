"""
AgentCoreMemory Bridge — Drop-in mem0-compatible adapter for BastionMemory.

Wraps BastionMemory to expose the mem0 ``Memory`` interface
(``add``, ``search``, ``get``, ``get_all``, ``update``, ``delete``, ...).

Usage::

    from bastion.bridge_mem0 import BastionMem0Bridge

    # Create a bridge (agent_id must match what BastionMemory expects)
    bridge = BastionMem0Bridge(agent_id="my-agent")

    # Store a message (infer=False stores verbatim)
    result = bridge.add("The user likes Python", agent_id="my-agent", infer=False)

    # Search
    result = bridge.search("programming preferences", top_k=3)
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from typing import Any

from bastion.memory import BastionMemory

logger = logging.getLogger(__name__)


class BastionMem0Bridge:
    """mem0-API-compatible wrapper around BastionMemory.

    Implements the full ``Memory`` public interface from the mem0 OSS SDK
    (``add``, ``search``, ``get``, ``get_all``, ``update``, ``delete``,
    ``delete_all``, ``history``, ``reset``).

    **Inference note:** mem0 typically uses an LLM to extract structured facts
    from conversational messages.  Bastion does not bundle an LLM, so when
    ``infer=True`` is passed to ``add()`` the bridge requires an ``infer_fn``
    callback (or raises ``NotImplementedError``).
    """

    def __init__(
        self,
        agent_id: str,
        connection_string: str | None = None,
        mock: bool | None = None,
        infer_fn: Callable[[str], list[dict[str, str]]] | None = None,
    ):
        self._memory = BastionMemory(agent_id, connection_string=connection_string, mock=mock)
        self._agent_id = agent_id
        self._infer_fn = infer_fn

    # ------------------------------------------------------------------
    # Public mem0-compatible API
    # ------------------------------------------------------------------

    def add(
        self,
        messages: str | list[dict[str, str]],
        *,
        user_id: str | None = None,
        agent_id: str | None = None,
        run_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        timestamp: Any = None,
        expiration_date: Any = None,
        infer: bool = True,
        memory_type: str | None = None,
        prompt: str | None = None,
    ) -> dict:
        """Store one or more memories.

        When ``infer=False`` the input is stored verbatim.
        When ``infer=True``, an ``infer_fn`` must have been provided at
        construction time.
        """
        if timestamp is not None:
            logger.warning("timestamp parameter is not supported and will be ignored")
        if prompt is not None:
            logger.warning("prompt parameter is not supported and will be ignored")

        if infer and self._infer_fn is not None:
            text = messages if isinstance(messages, str) else json.dumps(messages)
            facts = self._infer_fn(text)
            results = []
            for fact in facts:
                content = fact.get("content", fact.get("memory", str(fact)))
                mtype = fact.get("memory_type", memory_type or "fact")
                record = self._memory.store(mtype, content, metadata)
                results.append({
                    "id": record.memory_id,
                    "memory": record.content,
                    "event": "ADD",
                })
            return {"results": results}

        if infer and self._infer_fn is None:
            raise NotImplementedError(
                "infer=True requires an infer_fn to be provided at bridge construction"
            )

        # infer=False — store verbatim
        if isinstance(messages, str):
            items = [messages]
        else:
            items = [
                m.get("content", str(m))
                for m in messages
            ]

        results = []
        for item in items:
            record = self._memory.store(
                memory_type or "message",
                item,
                metadata,
            )
            results.append({
                "id": record.memory_id,
                "memory": record.content,
                "event": "ADD",
            })

        return {"results": results}

    def search(
        self,
        query: str,
        *,
        top_k: int = 20,
        filters: dict[str, Any] | None = None,
        threshold: float = 0.1,
        rerank: bool = False,
        explain: bool = False,
        reference_date: Any = None,
        show_expired: bool = False,
        **kwargs: Any,
    ) -> dict:
        """Semantic search across stored memories.

        Filters can contain ``user_id``, ``agent_id``, or ``run_id``
        (mapped to the Bastion agent_id).
        """
        agent_id = self._agent_id
        if filters:
            agent_id = filters.get("agent_id")
            if agent_id is None:
                agent_id = filters.get("user_id")
            if agent_id is None:
                agent_id = filters.get("run_id")
            if agent_id is None:
                agent_id = self._agent_id

        mtype = (filters or {}).get("memory_type") or kwargs.get("memory_type")

        results = self._memory.search(
            query,
            k=top_k,
            threshold=threshold,
            memory_type=mtype,
        )

        adapted = []
        for rec in results:
            entry = {
                "id": rec.memory_id,
                "memory": rec.content,
                "score": getattr(rec, "score", rec.importance_score if hasattr(rec, "importance_score") else 0.0),
                "agent_id": rec.agent_id,
                "memory_type": rec.memory_type,
                "created_at": str(rec.created_at),
                "metadata": rec.metadata or {},
            }
            if explain:
                entry["score_details"] = {
                    "importance": rec.importance_score if hasattr(rec, "importance_score") else 0.0,
                }
            adapted.append(entry)

        return {"results": adapted}

    def get(self, memory_id: str) -> dict | None:
        """Retrieve a single memory by exact ID (primary-key lookup)."""
        rec = self._memory.get_memory(memory_id)
        if rec is None:
            return None
        return self._record_to_dict(rec)

    def get_all(
        self,
        *,
        filters: dict[str, Any] | None = None,
        top_k: int = 20,
        show_expired: bool = False,
        **kwargs: Any,
    ) -> dict:
        """List all memories matching filters."""
        agent_id = self._agent_id
        if filters:
            agent_id = filters.get("agent_id")
            if agent_id is None:
                agent_id = filters.get("user_id")
            if agent_id is None:
                agent_id = filters.get("run_id")
            if agent_id is None:
                agent_id = self._agent_id

        if self._memory.is_mock:
            from bastion.mock import _agent_data, _lock
            with _lock:
                records = _agent_data.get(agent_id, [])
        else:
            results = self._memory.list_all()
            records = [r.to_dict() for r in results]

        adapted = [self._record_to_dict(rec) for rec in records[:top_k]]
        return {"results": adapted}

    def update(
        self,
        memory_id: str,
        data: str | None = None,
        metadata: dict[str, Any] | None = None,
        expiration_date: Any = None,
    ) -> dict:
        """Update a stored memory by ID (delete + re-store with updated content)."""
        if data is None and metadata is None and expiration_date is None:
            return {"message": "No updates provided"}
        existing = self.get(memory_id)
        if existing is None:
            raise ValueError(f"Memory with id '{memory_id}' not found")

        new_content = data if data is not None else existing.get("memory", "")
        meta_merged = {**(existing.get("metadata") or {}), **(metadata or {})}
        self.delete(memory_id)
        new_record = self._memory.store(existing.get("memory_type", "fact"), new_content, meta_merged)
        new_id = new_record.memory_id
        logger.info(
            "Memory updated (ID changed due to delete+re-store)",
            extra={"old_id": memory_id, "new_id": new_id},
        )
        return {"message": "Memory updated successfully!", "new_id": new_id}

    def delete(self, memory_id: str) -> dict:
        """Delete a single memory by ID."""
        if not self._memory.delete_memory(memory_id):
            raise ValueError(f"Memory with id '{memory_id}' not found")
        return {"message": "Memory deleted successfully!"}

    def delete_all(
        self,
        user_id: str | None = None,
        agent_id: str | None = None,
        run_id: str | None = None,
    ) -> dict:
        """Delete all memories for the given entity."""
        eid = agent_id or user_id or run_id or self._agent_id
        if not self._memory.is_mock:
            pool = self._memory.get_pool()
            conn = pool.acquire(timeout=30.0)
            try:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM agent_memory WHERE agent_id = %s", (eid,))
                conn.commit()
                return {"message": f"{cur.rowcount} memories deleted successfully!"}
            finally:
                pool.release(conn)
        from bastion.mock import _agent_data
        records = _agent_data.pop(eid, [])
        return {"message": f"{len(records)} memories deleted successfully!"}

    def history(self, memory_id: str) -> list[dict]:
        """Return change history for a memory (not persisted in mock mode)."""
        return []

    def reset(self) -> None:
        """Clear all stored memories."""
        if not self._memory.is_mock:
            self.delete_all(agent_id=self._agent_id)
            pool = self._memory.get_pool()
            conn = pool.acquire(timeout=30.0)
            try:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM agent_audit WHERE agent_id = %s", (self._agent_id,))
                conn.commit()
            finally:
                pool.release(conn)
        from bastion.mock import _agent_data
        _agent_data.clear()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _record_to_dict(self, rec: Any) -> dict:
        def _safe_ts(val):
            if val is None:
                return ""
            if hasattr(val, "isoformat"):
                return val.isoformat()
            return str(val)
        if isinstance(rec, dict):
            return {
                "id": rec.get("memory_id", ""),
                "memory": rec.get("content", ""),
                "agent_id": rec.get("agent_id", self._agent_id),
                "memory_type": rec.get("memory_type", "fact"),
                "created_at": _safe_ts(rec.get("created_at")),
                "metadata": rec.get("metadata", {}),
            }
        if hasattr(rec, "to_dict"):
            d = rec.to_dict()
            return {
                "id": d.get("memory_id", ""),
                "memory": d.get("content", ""),
                "agent_id": d.get("agent_id", self._agent_id),
                "memory_type": d.get("memory_type", "fact"),
                "created_at": _safe_ts(d.get("created_at")),
                "metadata": d.get("metadata", {}),
            }
        return {"id": "", "memory": str(rec), "agent_id": self._agent_id}
