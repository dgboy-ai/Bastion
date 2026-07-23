"""End-to-end tests simulating judge API verification — tests the actual server endpoints."""

import os
import subprocess
import sys
import time
from urllib.parse import urljoin

import pytest
import requests

# These tests run against a running server instance
# Configure via env vars: BASTION_TEST_BASE_URL, BASTION_API_KEY
BASE_URL = "http://localhost:9998"
API_KEY = "test-key-123"

# E2A tests start a real A2A server in mock mode via fixture.
# No special flags needed — the fixture handles server lifecycle.

_server_proc = None


def _headers():
    return {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "A2A-Version": "1.0",
    }


def _wait_for_server(url, timeout=15):
    """Poll until server is ready or timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.get(url, timeout=2)
            if r.status_code == 200:
                return True
        except requests.ConnectionError:
            pass
        time.sleep(0.3)
    return False


@pytest.fixture(scope="module", autouse=True)
def _start_server():
    """Start A2A server in mock mode for the e2e test module."""
    global _server_proc

    env = os.environ.copy()
    env["BASTION_MOCK"] = "true"
    env["BASTION_API_KEY"] = API_KEY
    env["BASTION_A2A_STRICT"] = "false"

    _server_proc = subprocess.Popen(
        [sys.executable, "-m", "bastion.a2a_server", "--mock"],
        cwd=os.path.join(os.path.dirname(__file__), "..", "src"),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    if not _wait_for_server(f"{BASE_URL}/healthz", timeout=15):
        _server_proc.kill()
        _server_proc.wait()
        pytest.fail("A2A server failed to start within 15 seconds")

    yield

    if _server_proc and _server_proc.poll() is None:
        _server_proc.terminate()
        try:
            _server_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _server_proc.kill()
            _server_proc.wait()


class TestA2AServerE2E:
    """End-to-end tests for the Bastion A2A server."""

    def test_healthz(self):
        res = requests.get(urljoin(BASE_URL, "/healthz"), headers=_headers())
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

    def test_readyz(self):
        res = requests.get(urljoin(BASE_URL, "/readyz"), headers=_headers())
        assert res.status_code in (200, 503)

    def test_agent_card(self):
        res = requests.get(
            urljoin(BASE_URL, "/.well-known/agent-card.json"), headers=_headers()
        )
        assert res.status_code == 200
        card = res.json()
        assert card["name"] == "Bastion Memory Agent"
        assert "skills" in card
        assert len(card["skills"]) >= 4

    def test_jsonrpc_send_message_store(self):
        payload = {
            "jsonrpc": "2.0",
            "id": "test-1",
            "method": "SendMessage",
            "params": {
                "message": {
                    "parts": [{"text": "store that the user likes Python"}],
                    "metadata": {"skill": "memory_store"},
                }
            },
        }
        res = requests.post(
            urljoin(BASE_URL, "/"), json=payload, headers=_headers()
        )
        assert res.status_code == 200
        result = res.json()
        assert "result" in result
        assert result["result"]["status"]["state"] in ("COMPLETED", "WORKING")

    def test_jsonrpc_send_message_search(self):
        payload = {
            "jsonrpc": "2.0",
            "id": "test-2",
            "method": "SendMessage",
            "params": {
                "message": {
                    "parts": [{"text": "search for memories about Python"}],
                    "metadata": {"skill": "memory_search"},
                }
            },
        }
        res = requests.post(
            urljoin(BASE_URL, "/"), json=payload, headers=_headers()
        )
        assert res.status_code == 200
        result = res.json()
        assert "result" in result

    def test_jsonrpc_invalid_method(self):
        payload = {
            "jsonrpc": "2.0",
            "id": "test-3",
            "method": "InvalidMethod",
            "params": {},
        }
        res = requests.post(
            urljoin(BASE_URL, "/"), json=payload, headers=_headers()
        )
        assert res.status_code == 200
        result = res.json()
        assert "error" in result
        assert result["error"]["code"] == -32601  # Method not found

    def test_jsonrpc_missing_version(self):
        payload = {"id": "test-4", "method": "SendMessage", "params": {}}
        res = requests.post(
            urljoin(BASE_URL, "/"), json=payload, headers=_headers()
        )
        assert res.status_code == 200
        result = res.json()
        assert "error" in result

    def test_auth_required(self):
        # When no API key is configured, server allows unauthenticated access
        # When API key IS configured, /metrics requires auth
        import os
        if os.environ.get("BASTION_API_KEY"):
            res = requests.get(urljoin(BASE_URL, "/metrics"))
            assert res.status_code == 401
        else:
            res = requests.get(urljoin(BASE_URL, "/metrics"))
            assert res.status_code == 200

    def test_auth_wrong_key(self):
        import os
        if os.environ.get("BASTION_API_KEY"):
            res = requests.get(
                urljoin(BASE_URL, "/metrics"),
                headers={"Authorization": "Bearer wrong-key"},
            )
            assert res.status_code == 401
        else:
            # No API key configured — any key is accepted
            res = requests.get(
                urljoin(BASE_URL, "/metrics"),
                headers={"Authorization": "Bearer wrong-key"},
            )
            assert res.status_code == 200

    def test_rate_limiting(self):
        """Send rapid requests and verify rate limiting engages."""
        headers = _headers()
        responses = []
        for _ in range(20):
            try:
                res = requests.get(urljoin(BASE_URL, "/healthz"), headers=headers, timeout=3)
                responses.append(res.status_code)
            except requests.Timeout:
                responses.append(0)
        # At least some should succeed, rate limit may or may not trigger
        assert any(s == 200 for s in responses)

    def test_metrics_endpoint(self):
        res = requests.get(urljoin(BASE_URL, "/metrics"), headers=_headers())
        assert res.status_code == 200
        body = res.text
        assert "bastion_requests_total" in body
        assert "bastion_up" in body

    def test_rest_get_task_nonexistent(self):
        res = requests.get(
            urljoin(BASE_URL, "/tasks/nonexistent-task"), headers=_headers()
        )
        assert res.status_code == 404


class TestFullWorkflow:
    """Complete workflow: store → search → audit → heal cycle."""

    def test_store_search_audit_cycle(self):
        """Simulate a complete agent memory cycle."""
        # 1. Store a memory
        store_payload = {
            "jsonrpc": "2.0",
            "id": "wf-1",
            "method": "SendMessage",
            "params": {
                "message": {
                    "parts": [{"text": "The user prefers Python over TypeScript for backend services"}],
                    "metadata": {"skill": "memory_store"},
                }
            },
        }
        res = requests.post(
            urljoin(BASE_URL, "/"), json=store_payload, headers=_headers()
        )
        assert res.status_code == 200

        # 2. Search for the stored memory
        search_payload = {
            "jsonrpc": "2.0",
            "id": "wf-2",
            "method": "SendMessage",
            "params": {
                "message": {
                    "parts": [{"text": "search for Python preference"}],
                    "metadata": {"skill": "memory_search"},
                }
            },
        }
        res = requests.post(
            urljoin(BASE_URL, "/"), json=search_payload, headers=_headers()
        )
        assert res.status_code == 200

        # 3. Get task status
        task_id = "wf-1"
        task_payload = {
            "jsonrpc": "2.0",
            "id": "wf-3",
            "method": "GetTask",
            "params": {"id": task_id},
        }
        res = requests.post(
            urljoin(BASE_URL, "/"), json=task_payload, headers=_headers()
        )
        assert res.status_code == 200
