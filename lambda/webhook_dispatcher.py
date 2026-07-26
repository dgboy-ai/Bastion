"""
Bastion A2A Webhook Dispatcher — Lambda function for CDC-triggered push notifications.

Receives CDC events from CockroachDB's a2a_tasks table and POSTs task state
transitions to registered callback URLs. Failed deliveries are retried via SQS
with exponential backoff (3 retries over 5 minutes).

Usage:
    Deployed via AWS SAM as part of the Bastion stack.
    Triggered by CockroachDB CDC changefeed on a2a_tasks table.
"""

from __future__ import annotations

import ipaddress
import json
import logging
import os
import socket
import time
from typing import Any
from urllib.parse import urlparse

import boto3
import requests

logger = logging.getLogger("bastion-webhook-dispatcher")

# SSRF protection: blocked networks and schemes
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),      # loopback
    ipaddress.ip_network("10.0.0.0/8"),        # private
    ipaddress.ip_network("172.16.0.0/12"),     # private
    ipaddress.ip_network("192.168.0.0/16"),    # private
    ipaddress.ip_network("169.254.0.0/16"),    # link-local (cloud metadata)
    ipaddress.ip_network("::1/128"),           # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),          # IPv6 private
    ipaddress.ip_network("fe80::/10"),         # IPv6 link-local
]


def _is_safe_url(url: str) -> bool:
    """Validate URL against SSRF attacks. Returns True if safe to request."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False

    # Only allow HTTP/HTTPS
    if parsed.scheme not in ("http", "https"):
        return False

    hostname = parsed.hostname
    if not hostname:
        return False

    # Block obviously dangerous hosts
    blocked_hosts = {"localhost", "metadata.google.internal", "169.254.169.254"}
    if hostname.lower() in blocked_hosts:
        return False

    # Resolve DNS and check against blocked networks
    try:
        resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC)
        for family, _, _, _, sockaddr in resolved:
            ip = ipaddress.ip_address(sockaddr[0])
            for net in _BLOCKED_NETWORKS:
                if ip in net:
                    logger.warning("SSRF blocked: %s resolves to private IP %s", hostname, ip)
                    return False
    except (socket.gaierror, ValueError):
        # DNS resolution failed — block to be safe
        return False

    return True

# Circuit breaker state
_failures = 0
_failure_threshold = 5
_failure_window = 300  # seconds
_failure_timestamps: list[float] = []


def _circuit_is_open() -> bool:
    """Check if circuit breaker is tripped."""
    now = time.time()
    # Remove old failures outside the window
    while _failure_timestamps and _failure_timestamps[0] < now - _failure_window:
        _failure_timestamps.pop(0)
    return len(_failure_timestamps) >= _failure_threshold


def _record_failure() -> None:
    """Record a failure for circuit breaker."""
    _failure_timestamps.append(time.time())


def _record_success() -> None:
    """Record a success — reset circuit breaker."""
    _failure_timestamps.clear()


def _dispatch_webhook(callback_url: str, payload: dict[str, Any]) -> bool:
    """POST task state to callback URL. Returns True on success."""
    if not _is_safe_url(callback_url):
        logger.warning("SSRF blocked: unsafe callback URL", extra={"callback_url": callback_url})
        return False
    try:
        resp = requests.post(
            callback_url,
            json=payload,
            timeout=10,
            headers={
                "Content-Type": "application/json",
                "X-Bastion-Event": "task.state_changed",
            },
            allow_redirects=False,
        )
        if resp.status_code < 300:
            logger.info(
                "Webhook delivered",
                extra={"callback_url": callback_url, "status_code": resp.status_code},
            )
            _record_success()
            return True
        else:
            logger.warning(
                "Webhook delivery failed",
                extra={"callback_url": callback_url, "status_code": resp.status_code},
            )
            _record_failure()
            return False
    except Exception:
        logger.exception("Webhook delivery error", extra={"callback_url": callback_url})
        _record_failure()
        return False


def _send_to_sqs(queue_url: str, payload: dict[str, Any], delay_seconds: int = 0) -> None:
    """Send failed webhook to SQS for retry."""
    try:
        sqs = boto3.client("sqs")
        sqs.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps(payload),
            DelaySeconds=min(delay_seconds, 900),  # SQS max delay is 15 min
        )
        logger.info("Webhook queued for retry", extra={"delay_seconds": delay_seconds})
    except Exception:
        logger.exception("Failed to queue webhook for retry")


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda handler for CDC events from a2a_tasks table.

    Event structure (from CockroachDB CDC):
    {
        "key": [...],
        "value": {
            "after": {
                "task_id": "...",
                "status": "COMPLETED",
                "callback_url": "https://...",
                ...
            }
        }
    }
    """
    global _failures

    if _circuit_is_open():
        logger.warning("Circuit breaker is open, skipping webhook dispatch")
        return {"statusCode": 503, "body": "Circuit breaker open"}

    dlq_url = os.environ.get("DLQ_URL", "")
    records = event.get("records", [event])  # Handle both single and batched events
    dispatched = 0
    failed = 0

    for record in records:
        try:
            # Parse CDC event
            value = record.get("value", record)
            if isinstance(value, str):
                value = json.loads(value)

            after = value.get("after", value)
            if isinstance(after, str):
                after = json.loads(after)

            task_id = after.get("task_id", "")
            status = after.get("status", "")
            callback_url = after.get("callback_url", "")

            if not callback_url or not task_id:
                continue

            # Build webhook payload
            payload = {
                "task_id": task_id,
                "status": status,
                "event": "task.state_changed",
                "timestamp": time.time(),
            }

            # Add artifacts if present
            artifacts = after.get("artifacts")
            if artifacts:
                payload["artifacts"] = artifacts

            # Dispatch
            success = _dispatch_webhook(callback_url, payload)
            if success:
                dispatched += 1
            else:
                failed += 1
                # Queue for retry via SQS
                if dlq_url:
                    _send_to_sqs(dlq_url, payload, delay_seconds=60)

        except Exception:
            logger.exception("Error processing CDC record")
            failed += 1

    logger.info("Webhook dispatch complete", extra={"dispatched": dispatched, "failed": failed})
    return {
        "statusCode": 200,
        "body": json.dumps({"dispatched": dispatched, "failed": failed}),
    }


def health_check(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Health check endpoint."""
    return {
        "statusCode": 200,
        "body": json.dumps({
            "status": "ok",
            "circuit_open": _circuit_is_open(),
            "failures_in_window": len(_failure_timestamps),
        }),
    }
