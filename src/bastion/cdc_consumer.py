"""CDC consumer for Bastion.

Tails the CockroachDB CDC changefeed output streamed to AWS S3 (the
``cdc-live/`` prefix) and reacts to events without polling the database:

* ``agent_memory`` changes  -> flag affected agents for async hash-chain
  verification (picked up by ``chain_verify``).
* ``agent_audit`` changes    -> forwarded to the dashboard real-time feed.

This is the event-driven counterpart to Bastion's polling paths: the
database pushes changes (CDC -> S3), and this consumer reacts. No cron,
no SELECT-polling of the source tables.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any

logger = logging.getLogger("bastion.cdc")


class S3CdcTailer:
    """Tail CDC NDJSON files from S3 and dispatch events to handlers.

    Tracks a watermark (the highest object key / last-modified seen) so a
    restart skips already-processed files. Each handled event is passed
    to registered callbacks. Errors are logged and never fatal.
    """

    def __init__(
        self,
        bucket: str | None = None,
        prefix: str = "cdc-live/",
        region: str | None = None,
        poll_interval: float = 10.0,
    ) -> None:
        self.bucket = bucket or os.environ.get("BASTION_S3_BUCKET", "bastion-memory-archives")
        self.prefix = prefix
        self.region = region or os.environ.get("AWS_REGION", "ap-south-1")
        self.poll_interval = poll_interval
        self._watermark: dict[str, tuple[str, str]] = {}  # file_key -> (etag, last_modified)
        self._handlers: list[Any] = []
        self._stop = threading.Event()
        self._client: Any = None
        self._thread: threading.Thread | None = None

    # ── setup ────────────────────────────────────────────────────────
    @property
    def _s3(self) -> Any:
        if self._client is None:
            import boto3

            self._client = boto3.client("s3", region_name=self.region)
        return self._client

    def on(self, handler: Any) -> None:
        """Register ``handler(event: dict, table: str) -> None``."""
        self._handlers.append(handler)

    # ── lifecycle ────────────────────────────────────────────────────
    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="bastion-cdc-tailer", daemon=True)
        self._thread.start()
        logger.info("S3 CDC tailer started on s3://%s/%s (poll %.1fs)", self.bucket, self.prefix, self.poll_interval)

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    # ── core loop ────────────────────────────────────────────────────
    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self._poll_once()
            except Exception as exc:
                logger.warning("CDC tailer poll failed: %s", exc)
            self._stop.wait(self.poll_interval)

    def _poll_once(self) -> None:
        files = self._list_new_files()
        for key in files:
            try:
                self._process_file(key)
            except Exception as exc:
                logger.warning("CDC tailer failed to process %s: %s", key, exc)

    def _list_new_files(self) -> list[str]:
        """Return NDJSON data files newer than our watermark (skips .RESOLVED)."""
        paginator = self._s3.get_paginator("list_objects_v2")
        new_keys: list[str] = []
        for page in paginator.paginate(Bucket=self.bucket, Prefix=self.prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if key.endswith(".RESOLVED"):
                    continue
                if not key.endswith(".ndjson"):
                    continue
                identity = (obj.get("ETag", ""), obj.get("LastModified", ""))
                prev = self._watermark.get(key)
                if prev is not None and prev == identity:
                    continue  # already processed this exact object
                new_keys.append(key)
                self._watermark[key] = identity
        # Deterministic order: oldest first (filename embeds timestamp).
        return sorted(new_keys)

    def _process_file(self, key: str) -> None:
        obj = self._s3.get_object(Bucket=self.bucket, Key=key)
        body = obj["Body"].read().decode("utf-8", "replace")
        table = self._table_from_key(key)
        for line in body.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(record, dict) or "after" not in record:
                continue
            event = record["after"] if isinstance(record["after"], dict) else {}
            if not event:
                continue
            for handler in self._handlers:
                try:
                    handler(event, table)
                except Exception as exc:
                    logger.warning("CDC handler failed: %s", exc)

    @staticmethod
    def _table_from_key(key: str) -> str:
        base = key.rsplit("/", 1)[-1] if "/" in key else key
        for table in ("agent_memory", "agent_audit"):
            if f"-{table}-" in base:
                return table
        return "unknown"


class CdcEventBus:
    """In-process event bus bridging CDC events to dashboard subscribers.

    Keeps a bounded ring buffer of recent events and exposes a ``since``
    cursor so the dashboard SSE/JSON endpoint can read new events without
    re-reading S3 or polling the database.
    """

    def __init__(self, max_events: int = 500) -> None:
        self._events: list[dict[str, Any]] = []
        self._max = max_events
        self._seq = 0
        self._lock = threading.Lock()

    def push(self, event: dict[str, Any]) -> int:
        with self._lock:
            self._seq += 1
            event = dict(event)
            event["_seq"] = self._seq
            self._events.append(event)
            if len(self._events) > self._max:
                del self._events[: len(self._events) - self._max]
            return self._seq

    def since(self, after_seq: int = 0, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            return [e for e in self._events if e.get("_seq", 0) > after_seq][-limit:]

    def latest(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            return list(reversed(self._events[-limit:]))

    @property
    def last_seq(self) -> int:
        with self._lock:
            return self._seq


def build_cdc_handlers(bus: CdcEventBus, memory: Any) -> list[Any]:
    """Construct the standard CDC handlers used by the MCP server.

    * audit events  -> push to the dashboard event bus (real-time feed).
    * memory events -> schedule async hash-chain verification for the
      affected agent via the existing needs_verification/chain_verify flow.
    """
    from bastion.memory import BastionMemory

    handlers: list[Any] = []
    # Throttle async verification per agent so a persistent corruption does
    # not trigger a verify storm on every CDC event.
    _verify_lock = threading.Lock()
    _last_verify: dict[str, float] = {}
    _verify_cooldown = float(os.environ.get("BASTION_CDC_VERIFY_COOLDOWN", "60"))

    def _audit_handler(event: dict[str, Any], table: str) -> None:
        if table != "agent_audit":
            return
        bus.push(
            {
                "source": "cdc",
                "kind": "audit",
                "action": event.get("action", ""),
                "agent_id": event.get("agent_id", ""),
                "audit_id": event.get("audit_id", ""),
                "details": event.get("details"),
                "recorded_at": event.get("recorded_at"),
            }
        )

    def _memory_handler(event: dict[str, Any], table: str) -> None:
        if table != "agent_memory":
            return
        agent_id = event.get("agent_id", "")
        if not agent_id:
            return
        # Push to the live feed for visibility.
        bus.push(
            {
                "source": "cdc",
                "kind": "memory",
                "action": "memory_changed",
                "agent_id": agent_id,
                "memory_id": event.get("memory_id", ""),
                "memory_type": event.get("memory_type", ""),
                "recorded_at": event.get("created_at") or event.get("updated"),
            }
        )
        # Async hash-chain verification: pick up any memories already flagged
        # with needs_verification=true (set at insert time) and verify them.
        # Do NOT re-flag ALL memories — that causes an infinite loop where
        # chain_verify keeps finding the same mismatches.
        if isinstance(memory, BastionMemory):
            try:
                now = time.time()
                with _verify_lock:
                    last = _last_verify.get(agent_id, 0.0)
                    if now - last < _verify_cooldown:
                        return
                    _last_verify[agent_id] = now
                mem = memory
                mem.chain_verify()
            except Exception as exc:
                logger.warning("CDC async verification for %s failed: %s", agent_id, exc)

    handlers.append(_audit_handler)
    handlers.append(_memory_handler)
    return handlers


# module-level singleton bus shared with the dashboard HTTP routes
_bus: CdcEventBus | None = None
_bus_lock = threading.Lock()


def get_bus() -> CdcEventBus:
    global _bus
    with _bus_lock:
        if _bus is None:
            _bus = CdcEventBus()
        return _bus
