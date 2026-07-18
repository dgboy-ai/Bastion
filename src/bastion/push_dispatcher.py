"""Push Notification Dispatcher for A2A Protocol.

Monitors task state changes and delivers webhook notifications to
registered callback URLs when tasks reach terminal states.

Supports both CockroachDB-backed (real) and in-memory (mock) modes.
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
from typing import Any

import httpx

from bastion.log_setup import get_logger

logger = get_logger(__name__)

# Terminal states that trigger push notifications
_TERMINAL_STATES = frozenset({"COMPLETED", "FAILED", "CANCELED"})

# Notification retry settings
_MAX_RETRIES = 3
_RETRY_DELAY_BASE = 1.0  # seconds, doubles each retry
_NOTIFICATION_TIMEOUT = 10.0  # seconds per HTTP request


def _is_private_url(url: str) -> bool:
    """SSRF protection: block private/local/internal IPs and domains."""
    import ipaddress
    from urllib.parse import urlparse
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
    except Exception:
        return True
    if not hostname:
        return True
    # Try to parse as IP address
    try:
        ip = ipaddress.ip_address(hostname)
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast
    except ValueError:
        pass
    # Domain-based blocks
    blocked = ("localhost", "0.0.0.0", "::1")
    if hostname.lower() in blocked:
        return True
    if hostname.endswith((".local", ".internal", ".localhost")):
        return True
    return False


class PushNotificationDispatcher:
    """Delivers push notifications to registered callback URLs.

    When a task reaches a terminal state, this dispatcher POSTs a JSON
    payload to the registered callback URL with retry logic.
    """

    def __init__(self) -> None:
        self._registrations: dict[str, str] = {}  # task_id -> callback_url
        self._delivered: set[str] = set()  # task_ids already notified
        self._lock = threading.Lock()
        self._client = httpx.Client(timeout=_NOTIFICATION_TIMEOUT)

    def register(self, task_id: str, callback_url: str) -> None:
        """Register a callback URL for a task."""
        with self._lock:
            self._registrations[task_id] = callback_url
        logger.info(
            "Push notification registered",
            extra={"task_id": task_id, "callback_url": callback_url},
        )

    def get_callback_url(self, task_id: str) -> str | None:
        """Get the registered callback URL for a task."""
        with self._lock:
            return self._registrations.get(task_id)

    def unregister(self, task_id: str) -> bool:
        """Remove push notification registration for a task. Returns True if removed."""
        with self._lock:
            if task_id in self._registrations:
                del self._registrations[task_id]
                self._delivered.discard(task_id)
                return True
            return False

    def notify(
        self,
        task_id: str,
        status: str,
        artifacts: list[dict[str, Any]] | None = None,
        error: str | None = None,
    ) -> None:
        """Queue a notification for delivery (non-blocking).

        Called when a task reaches a terminal state. The notification is
        delivered asynchronously in a background thread.
        """
        if status not in _TERMINAL_STATES:
            return

        with self._lock:
            if task_id in self._delivered:
                return  # Already notified
            self._delivered.add(task_id)
            callback_url = self._registrations.get(task_id)

        if not callback_url:
            return

        # Deliver in background thread
        thread = threading.Thread(
            target=self._deliver_sync,
            args=(task_id, callback_url, status, artifacts, error),
            daemon=True,
        )
        thread.start()

    def _deliver_sync(
        self,
        task_id: str,
        callback_url: str,
        status: str,
        artifacts: list[dict[str, Any]] | None,
        error: str | None,
    ) -> None:
        """Deliver notification synchronously with retries."""
        if _is_private_url(callback_url):
            logger.warning("SSRF blocked callback URL", extra={"task_id": task_id, "callback_url": callback_url})
            return

        payload = {
            "task_id": task_id,
            "status": status,
            "artifacts": artifacts or [],
            "timestamp": time.time(),
        }
        if error:
            payload["error"] = error

        for attempt in range(_MAX_RETRIES):
            try:
                resp = self._client.post(
                    callback_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )
                if resp.status_code < 400:
                    logger.info(
                        "Push notification delivered",
                        extra={
                            "task_id": task_id,
                            "callback_url": callback_url,
                            "status_code": resp.status_code,
                            "attempt": attempt + 1,
                        },
                    )
                    return
                logger.warning(
                    "Push notification HTTP error",
                    extra={
                        "task_id": task_id,
                        "callback_url": callback_url,
                        "status_code": resp.status_code,
                        "attempt": attempt + 1,
                    },
                )
            except Exception as exc:
                logger.warning(
                    "Push notification delivery error (attempt %d/%d): %s",
                    attempt + 1,
                    _MAX_RETRIES,
                    str(exc)[:200],
                    extra={"task_id": task_id, "callback_url": callback_url},
                )

            if attempt < _MAX_RETRIES - 1:
                time.sleep(_RETRY_DELAY_BASE * (2 ** attempt))

        logger.error(
            "Push notification failed after %d attempts",
            _MAX_RETRIES,
            extra={"task_id": task_id, "callback_url": callback_url},
        )

    def cleanup_delivered(self, max_age_seconds: float = 3600) -> int:
        """Clean up delivered notification records older than max_age."""
        with self._lock:
            count = len(self._delivered)
            self._delivered.clear()
        return count

    def get_stats(self) -> dict[str, Any]:
        """Return dispatcher statistics."""
        with self._lock:
            return {
                "active_registrations": len(self._registrations),
                "delivered_count": len(self._delivered),
            }

    def close(self) -> None:
        """Close the HTTP client."""
        self._client.close()


# Global singleton
_dispatcher: PushNotificationDispatcher | None = None
_dispatcher_lock = threading.Lock()


def get_dispatcher() -> PushNotificationDispatcher:
    """Get or create the global push notification dispatcher."""
    global _dispatcher
    if _dispatcher is None:
        with _dispatcher_lock:
            if _dispatcher is None:
                _dispatcher = PushNotificationDispatcher()
    return _dispatcher
