"""Tests for the Bastion webhook notification system."""

from __future__ import annotations

from unittest import mock

import pytest

from bastion.webhooks import (
    EventSeverity,
    WebhookEvent,
    WebhookNotifier,
    get_notifier,
)


@pytest.fixture
def sample_event():
    return WebhookEvent(
        event_type="memory_poisoning",
        severity=EventSeverity.CRITICAL,
        title="ASI06 Attack Detected",
        message="Injection pattern found in memory write",
        details={"pattern": "ignore previous instructions", "confidence": 0.85},
    )


class TestPayloadFormatting:
    def test_slack_format(self, sample_event):
        notifier = WebhookNotifier()
        payload = notifier._format_payload(sample_event, "https://hooks.slack.com/services/xxx")
        assert "text" in payload
        assert "[CRITICAL]" in payload["text"]
        assert "blocks" in payload
        assert payload["blocks"][0]["type"] == "header"
        assert payload["blocks"][0]["text"]["text"] == "ASI06 Attack Detected"

    def test_discord_format(self, sample_event):
        notifier = WebhookNotifier()
        payload = notifier._format_payload(sample_event, "https://discord.com/api/webhooks/xxx")
        assert "embeds" in payload
        embed = payload["embeds"][0]
        assert embed["title"] == "ASI06 Attack Detected"
        assert embed["color"] == 15548997
        assert len(embed["fields"]) == 3
        field_map = {f["name"]: f["value"] for f in embed["fields"]}
        assert field_map["Event Type"] == "memory_poisoning"
        assert field_map["Severity"] == "critical"

    def test_generic_format(self, sample_event):
        notifier = WebhookNotifier()
        payload = notifier._format_payload(sample_event, "https://example.com/webhook")
        assert payload["event_type"] == "memory_poisoning"
        assert payload["severity"] == "critical"
        assert payload["title"] == "ASI06 Attack Detected"
        assert payload["message"] == "Injection pattern found in memory write"
        assert payload["details"]["pattern"] == "ignore previous instructions"
        assert "timestamp" in payload

    def test_info_severity_discord_color(self):
        notifier = WebhookNotifier()
        event = WebhookEvent(
            event_type="info",
            severity=EventSeverity.INFO,
            title="Info",
            message="Just info",
        )
        payload = notifier._format_payload(event, "https://discord.com/api/webhooks/xxx")
        assert payload["embeds"][0]["color"] == 5814783

    def test_warning_severity_discord_color(self):
        notifier = WebhookNotifier()
        event = WebhookEvent(
            event_type="warning",
            severity=EventSeverity.WARNING,
            title="Warn",
            message="Warning message",
        )
        payload = notifier._format_payload(event, "https://discord.com/api/webhooks/xxx")
        assert payload["embeds"][0]["color"] == 16766720


class TestWebhookNotifier:
    def test_singleton_pattern(self):
        n1 = get_notifier()
        n2 = get_notifier()
        assert n1 is n2

    def test_disabled_when_no_urls(self):
        with mock.patch.dict("os.environ", {"BASTION_WEBHOOK_URLS": ""}):
            n = WebhookNotifier()
            assert n._enabled is False
            assert n._urls == []

    def test_parses_urls_from_env(self):
        env = {"BASTION_WEBHOOK_URLS": "https://a.com/webhook,https://b.com/webhook"}
        with mock.patch.dict("os.environ", env):
            n = WebhookNotifier()
            assert n._enabled is True
            assert len(n._urls) == 2
            assert n._urls == ["https://a.com/webhook", "https://b.com/webhook"]

    def test_send_does_nothing_when_disabled(self):
        with mock.patch.dict(
            "os.environ",
            {},
        ):
            n = WebhookNotifier()
            event = WebhookEvent(event_type="test", severity=EventSeverity.INFO, title="T", message="M")
            n.send(event)
            assert n.get_stats()["sent"] == 0
            assert n.get_stats()["failed"] == 0

    def test_http_post_success(self, sample_event):
        env = {"BASTION_WEBHOOK_URLS": "https://hooks.slack.com/services/test"}
        with (
            mock.patch.dict(
                "os.environ",
                env,
            ),
            mock.patch("urllib.request.urlopen") as mock_urlopen,
        ):
            mock_urlopen.return_value.__enter__.return_value.status = 200
            n = WebhookNotifier()
            n._send_sync(sample_event)
            stats = n.get_stats()
            assert stats["sent"] == 1
            assert stats["failed"] == 0

    def test_http_post_failure(self, sample_event):
        with (
            mock.patch.dict(
                "os.environ",
                {"BASTION_WEBHOOK_URLS": "https://hooks.slack.com/services/bad"},
            ),
            mock.patch("httpx.Client") as mock_client,
        ):
            mock_client.return_value.__enter__.return_value.post.side_effect = ConnectionError("unreachable")
            n = WebhookNotifier()
            n._send_sync(sample_event)
            stats = n.get_stats()
            assert stats["sent"] == 0
            assert stats["failed"] == 1

    def test_send_to_multiple_webhooks(self, sample_event):
        with (
            mock.patch.dict(
                "os.environ",
                {"BASTION_WEBHOOK_URLS": "https://hooks.slack.com/a,https://discord.com/api/webhooks/b"},
            ),
            mock.patch("httpx.Client") as mock_client,
        ):
            mock_client.return_value.__enter__.return_value.post.return_value.status_code = 200
            n = WebhookNotifier()
            n._send_sync(sample_event)
            stats = n.get_stats()
            assert stats["sent"] == 2
            assert stats["failed"] == 0

    def test_partial_failure(self, sample_event):
        def _side_effect(url, **kwargs):
            url_str = str(url)
            if "slack" in url_str:
                raise ConnectionError("timeout")
            resp = mock.MagicMock()
            resp.status_code = 200
            return resp

        with (
            mock.patch.dict(
                "os.environ",
                {"BASTION_WEBHOOK_URLS": "https://hooks.slack.com/a,https://discord.com/api/webhooks/b"},
            ),
            mock.patch("httpx.Client") as mock_client,
        ):
            mock_client.return_value.__enter__.return_value.post.side_effect = _side_effect
            n = WebhookNotifier()
            n._send_sync(sample_event)
            stats = n.get_stats()
            assert stats["sent"] == 1
            assert stats["failed"] == 1

    def test_send_async_alias(self):
        with mock.patch.dict(
            "os.environ",
            {},
        ):
            n = WebhookNotifier()
            event = WebhookEvent(event_type="t", severity=EventSeverity.INFO, title="T", message="M")
            n.send_async(event)
            assert n.get_stats()["sent"] == 0

    def test_webhook_event_dataclass(self):
        event = WebhookEvent(
            event_type="drift",
            severity=EventSeverity.WARNING,
            title="Drift detected",
            message="Score exceeded threshold",
            details={"score": 0.7},
        )
        assert event.event_type == "drift"
        assert event.severity == EventSeverity.WARNING
        assert event.title == "Drift detected"
        assert event.timestamp is not None
        assert event.details["score"] == 0.7

    def test_get_stats_endpoints(self):
        with mock.patch.dict(
            "os.environ",
            {"BASTION_WEBHOOK_URLS": "https://a.com,https://b.com"},
        ):
            n = WebhookNotifier()
            stats = n.get_stats()
            assert stats["endpoints"] == 2
