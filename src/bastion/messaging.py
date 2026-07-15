"""Pub/Sub messaging — broadcast events and consume messages between agents."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from bastion.log_setup import get_logger
from bastion.models import MessageRecord

logger = get_logger(__name__)


class MessageBroker:
    """Manages inter-agent pub/sub messaging via CockroachDB."""

    def __init__(self, agent_id: str, get_pool_fn: Any, is_mock_fn: Any):
        self.agent_id = agent_id
        self._get_pool = get_pool_fn
        self._is_mock = is_mock_fn

    def broadcast(self, event_type: str, payload: dict | None, namespace: str) -> MessageRecord:
        if self._is_mock():
            return MessageRecord(
                message_id=str(uuid.uuid4()),
                namespace=namespace,
                sender_agent_id=self.agent_id,
                event_type=event_type,
                payload=payload or {},
                created_at=datetime.now(UTC),
            )
        pool = self._get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO agent_messages (namespace, sender_agent_id, event_type, payload) "
                    "VALUES (%s, %s, %s, %s) "
                    "RETURNING message_id, namespace, sender_agent_id, event_type, payload, created_at",
                    (namespace, self.agent_id, event_type, json.dumps(payload or {}, default=str)),
                )
                row = cur.fetchone()
            conn.commit()
            if row:
                return MessageRecord(
                    message_id=str(row[0]),
                    namespace=row[1],
                    sender_agent_id=row[2],
                    event_type=row[3],
                    payload=row[4] or {},
                    created_at=row[5],
                )
            return MessageRecord(
                message_id=str(uuid.uuid4()),
                namespace=namespace,
                sender_agent_id=self.agent_id,
                event_type=event_type,
                payload=payload or {},
                created_at=datetime.now(UTC),
            )
        finally:
            pool.release(conn)

    def consume(self, namespace: str | None = None, limit: int = 50) -> list[MessageRecord]:
        pool = self._get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            with conn.cursor() as cur:
                if namespace:
                    cur.execute(
                        "SELECT message_id, namespace, sender_agent_id, event_type, payload, created_at "
                        "FROM agent_messages WHERE namespace = %s AND read = FALSE "
                        "ORDER BY created_at DESC LIMIT %s FOR UPDATE SKIP LOCKED",
                        (namespace, limit),
                    )
                else:
                    cur.execute(
                        "SELECT message_id, namespace, sender_agent_id, event_type, payload, created_at "
                        "FROM agent_messages WHERE read = FALSE "
                        "ORDER BY created_at DESC LIMIT %s FOR UPDATE SKIP LOCKED",
                        (limit,),
                    )
                rows = cur.fetchall()
                if rows:
                    message_ids = [str(r[0]) for r in rows]
                    cur.execute(
                        "UPDATE agent_messages SET read = TRUE WHERE message_id = ANY(%s)",
                        (message_ids,),
                    )
                conn.commit()
                return [
                    MessageRecord(
                        message_id=str(r[0]),
                        namespace=r[1],
                        sender_agent_id=r[2],
                        event_type=r[3],
                        payload=r[4] or {},
                        created_at=r[5],
                    )
                    for r in rows
                ]
        finally:
            pool.release(conn)
