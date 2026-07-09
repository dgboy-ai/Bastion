"""
Webhook notification system for Bastion CDC events and anomaly alerts.

Sends notifications to configured webhook URLs when:
- Memory poisoning is detected (ASI06)
- Hash chain integrity violation
- Drift threshold exceeded
- CDC self-healing triggered
- Circuit breaker state changes

Supports Slack, Discord, generic webhooks, and SNS topics.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

logger = logging.getLogger(__name__)


class EventSeverity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class WebhookEvent:
    event_type: str
    severity: EventSeverity
    title: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


class WebhookNotifier:
    """Sends events to configured webhook endpoints.

    Reads BASTION_WEBHOOK_URLS env var (comma-separated URLs).
    Supports Slack, Discord, and generic JSON webhooks.
    Uses a background thread pool to avoid blocking the caller.
    """

    def __init__(self) -> None:
        urls = os.environ.get("BASTION_WEBHOOK_URLS", "")
        self._urls = [u.strip() for u in urls.split(",") if u.strip()]
        self._enabled = len(self._urls) > 0
        self._sent_count = 0
        self._failed_count = 0
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=5, thread_name_prefix="bastion_webhook_")

        if self._enabled:
            logger.info("Webhook notifier enabled with %d endpoint(s)", len(self._urls))

    def send(self, event: WebhookEvent) -> None:
        """Send a webhook event (non-blocking, background thread pool)."""
        if not self._enabled:
            return
        self._executor.submit(self._send_sync, event)

    def send_async(self, event: WebhookEvent) -> None:
        """Alias for send()."""
        self.send(event)

    def _send_sync(self, event: WebhookEvent) -> None:
        """Send event to all configured webhooks."""
        for url in self._urls:
            try:
                payload = self._format_payload(event, url)
                self._http_post(url, payload)
                with self._lock:
                    self._sent_count += 1
            except Exception as e:
                with self._lock:
                    self._failed_count += 1
                logger.warning("Webhook send failed to %s: %s", url, e)

    def _format_payload(self, event: WebhookEvent, url: str) -> dict[str, Any]:
        if "hooks.slack.com" in url:
            return {
                "text": f"[{event.severity.upper()}] {event.title}",
                "blocks": [
                    {"type": "header", "text": {"type": "plain_text", "text": event.title}},
                    {"type": "section", "text": {"type": "mrkdwn", "text": event.message}},
                    {"type": "context", "elements": [
                        {"type": "mrkdwn", "text": f"*Type:* {event.event_type} | *Severity:* {event.severity}"},
                    ]},
                    {"type": "section", "text": {"type": "mrkdwn", "text": f"`{json.dumps(event.details, indent=2)}`"}},
                ],
            }
        if "discord.com" in url:
            color_map = {"info": 5814783, "warning": 16766720, "error": 15548997, "critical": 15548997}
            return {
                "embeds": [{
                    "title": event.title,
                    "description": event.message,
                    "color": color_map.get(event.severity, 5814783),
                    "fields": [
                        {"name": "Event Type", "value": event.event_type, "inline": True},
                        {"name": "Severity", "value": event.severity, "inline": True},
                        {
                            "name": "Details",
                            "value": f"```json\n{json.dumps(event.details, indent=2)}\n```",
                            "inline": False,
                        },
                    ],
                    "timestamp": event.timestamp,
                }],
            }
        return {
            "event_type": event.event_type,
            "severity": event.severity,
            "title": event.title,
            "message": event.message,
            "details": event.details,
            "timestamp": event.timestamp,
        }

    @staticmethod
    def _validate_url(url: str) -> None:
        """Validate URL to prevent SSRF — block private/internal IPs."""
        import urllib.parse
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"Unsupported URL scheme: {parsed.scheme}")
        host = parsed.hostname or ""
        if host in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
            raise ValueError(f"Blocked internal URL: {url}")
        if any(host.startswith(p) for p in ("169.254.", "10.", "172.16.", "192.168.")):
            raise ValueError(f"Blocked private IP URL: {url}")

    def _http_post(self, url: str, payload: dict[str, Any]) -> None:
        self._validate_url(url)
        import urllib.request
        data = json.dumps(payload).encode()
        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10)

    def get_stats(self) -> dict[str, int]:
        return {"sent": self._sent_count, "failed": self._failed_count, "endpoints": len(self._urls)}


_SINGLETON_LOCK = threading.Lock()
_SINGLETON: WebhookNotifier | None = None


def get_notifier() -> WebhookNotifier:
    global _SINGLETON
    if _SINGLETON is None:
        with _SINGLETON_LOCK:
            if _SINGLETON is None:
                _SINGLETON = WebhookNotifier()
    return _SINGLETON
