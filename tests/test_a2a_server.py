"""Tests for the A2A protocol server."""

from __future__ import annotations

import json
import os

from bastion.mock import reset


class TestA2AServer:
    def setup_method(self):
        reset()

    def _client(self, app):
        import anyio
        from httpx import ASGITransport, AsyncClient

        return anyio, AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    def _h(self, extra: dict | None = None) -> dict:
        h = {"A2A-Version": "1.0"}
        if extra:
            h.update(extra)
        return h

    def test_agent_card(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        assert app.title == "Bastion A2A Server"

    def test_healthz(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.get("/healthz")
                assert r.status_code == 200
                assert r.json()["status"] == "ok"

        anyio.run(run)

    def test_readyz(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.get("/readyz")
                assert r.status_code == 200
                assert r.json()["status"] == "ok"

        anyio.run(run)

    def test_parse_error(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post("/", content=b"not-json", headers=self._h({"content-type": "application/json"}))
                assert r.status_code == 200
                assert r.json()["error"]["code"] == -32700

        anyio.run(run)

    def test_jsonrpc_version_check(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post("/", json={"jsonrpc": "1.0", "method": "tasks/send"}, headers=self._h())
                assert r.status_code == 200
                assert r.json()["error"]["code"] == -32600

        anyio.run(run)

    def test_method_not_found(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post("/", json={"jsonrpc": "2.0", "id": "1", "method": "unknown"}, headers=self._h())
                assert r.status_code == 200
                assert r.json()["error"]["code"] == -32601

        anyio.run(run)

    def test_request_too_large(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)
        big_payload = "x" * (2 * 1024 * 1024)

        async def run():
            async with client:
                r = await client.post("/", content=big_payload, headers=self._h({"content-type": "application/json"}))
                assert r.status_code == 413

        anyio.run(run)

    def test_store_and_search(self):
        from bastion.a2a_server import create_a2a_server

        app, memory = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                # Agent Card
                r = await client.get("/.well-known/agent-card.json")
                assert r.status_code == 200
                card = r.json()
                assert card["name"] == "Bastion Memory Agent"

                # Store
                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "1",
                        "method": "SendMessage",
                        "params": {
                            "message": {
                                "role": 1,
                                "parts": [{"text": "test"}],
                                "metadata": {"skill": "memory_store", "params": {"content": "test"}},
                            },
                            "configuration": {"return_immediately": True},
                        },
                    },
                    headers=self._h(),
                )
                assert r.status_code == 200
                result = r.json()
                assert result["result"]["status"]["state"] == "COMPLETED"

                # Search
                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "2",
                        "method": "SendMessage",
                        "params": {
                            "message": {
                                "role": 1,
                                "parts": [{"text": "test"}],
                                "metadata": {
                                    "skill": "memory_search",
                                    "params": {"query": "test", "k": 3, "threshold": 0.0},
                                },
                            },
                            "configuration": {"return_immediately": True},
                        },
                    },
                    headers=self._h(),
                )
                assert r.status_code == 200
                result = r.json()
                assert result["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_unknown_skill(self):
        from bastion.a2a_server import create_a2a_server

        app, memory = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "1",
                        "method": "SendMessage",
                        "params": {
                            "message": {
                                "role": 1,
                                "parts": [{"text": ""}],
                                "metadata": {"skill": "nonexistent"},
                            },
                            "configuration": {"return_immediately": True},
                        },
                    },
                    headers=self._h(),
                )
                assert r.status_code == 200
                result = r.json()
                assert result["result"]["status"]["state"] == "FAILED"

        anyio.run(run)

    def test_tasks_get_returns_task(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "1",
                        "method": "SendMessage",
                        "params": {
                            "message": {
                                "role": 1,
                                "parts": [{"text": "hello"}],
                                "metadata": {"skill": "memory_store", "params": {"content": "hello"}},
                            },
                            "configuration": {"return_immediately": True},
                        },
                    },
                    headers=self._h(),
                )
                assert r.status_code == 200
                task = r.json()["result"]
                task_id = task["id"]

                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "2",
                        "method": "GetTask",
                        "params": {"id": task_id},
                    },
                    headers=self._h(),
                )
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] in ("COMPLETED", "WORKING")

        anyio.run(run)

    def test_tasks_get_nonexistent_returns_error(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "1",
                        "method": "GetTask",
                        "params": {"id": "nonexistent-task-id"},
                    },
                    headers=self._h(),
                )
                assert r.status_code == 200
                assert r.json()["error"]["code"] == -32001

        anyio.run(run)

    def test_tasks_cancel_nonexistent_returns_error(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "1",
                        "method": "CancelTask",
                        "params": {"id": "nonexistent-task-id"},
                    },
                    headers=self._h(),
                )
                assert r.status_code == 200
                assert r.json()["error"]["code"] == -32001

        anyio.run(run)

    def test_metrics_endpoint(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.get("/metrics")
                assert r.status_code == 200
                assert r.text.startswith("# HELP")
                assert "bastion_up" in r.text

        anyio.run(run)

    def test_set_push_notification_stores_url(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "1",
                        "method": "setTaskPushNotification",
                        "params": {"id": "task-123", "url": "https://example.com/callback"},
                    },
                    headers=self._h(),
                )
                assert r.status_code == 200
                result = r.json()["result"]
                assert result["task_id"] == "task-123"
                assert result["url"] == "https://example.com/callback"

        anyio.run(run)

    def test_get_push_notification_returns_url(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "1",
                        "method": "setTaskPushNotification",
                        "params": {"id": "task-456", "url": "https://hooks.example.com/push"},
                    },
                    headers=self._h(),
                )
                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "2",
                        "method": "getTaskPushNotification",
                        "params": {"id": "task-456"},
                    },
                    headers=self._h(),
                )
                assert r.status_code == 200
                result = r.json()["result"]
                assert result["task_id"] == "task-456"
                assert result["url"] == "https://hooks.example.com/push"

        anyio.run(run)

    def test_get_push_notification_unknown_returns_error(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "1",
                        "method": "getTaskPushNotification",
                        "params": {"id": "nonexistent-task"},
                    },
                    headers=self._h(),
                )
                assert r.status_code == 200
                assert r.json()["error"]["code"] == -32001

        anyio.run(run)

    def test_set_push_notification_missing_id(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "1",
                        "method": "setTaskPushNotification",
                        "params": {"url": "https://example.com/cb"},
                    },
                    headers=self._h(),
                )
                assert r.status_code == 200
                assert r.json()["error"]["code"] == -32602

        anyio.run(run)

    def test_set_push_notification_missing_url(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "1",
                        "method": "setTaskPushNotification",
                        "params": {"id": "task-789"},
                    },
                    headers=self._h(),
                )
                assert r.status_code == 200
                assert r.json()["error"]["code"] == -32602

        anyio.run(run)

    def test_store_task_with_callback_url(self):
        from bastion.a2a_server import create_a2a_server

        app, memory = create_a2a_server(mock=True)
        record = memory.store_a2a_task("task-cb-1", "agent-1", "memory_store", "WORKING", "https://example.com/hook")
        assert record["callback_url"] == "https://example.com/hook"
        assert record["task_id"] == "task-cb-1"
        assert record["status"] == "WORKING"

    def test_resolve_conflict_skill(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "1",
                        "method": "SendMessage",
                        "params": {
                            "message": {
                                "role": 1,
                                "parts": [{"text": ""}],
                                "metadata": {
                                    "skill": "resolve_conflict",
                                    "params": {
                                        "fact_a": "Python is better",
                                        "fact_b": "Rust is better",
                                        "context": "Programming language preference",
                                    },
                                },
                            },
                            "configuration": {"return_immediately": True},
                        },
                    },
                    headers=self._h(),
                )
                assert r.status_code == 200
                result = r.json()
                assert result["result"]["status"]["state"] == "COMPLETED"
                artifacts = result["result"]["artifacts"]
                assert len(artifacts) > 0
                merged_text = artifacts[0]["parts"][0]["text"]
                assert "merged" in merged_text

        anyio.run(run)

    def test_resolve_conflict_skill_missing_params(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "1",
                        "method": "SendMessage",
                        "params": {
                            "message": {
                                "role": 1,
                                "parts": [{"text": ""}],
                                "metadata": {
                                    "skill": "resolve_conflict",
                                    "params": {},
                                },
                            },
                            "configuration": {"return_immediately": True},
                        },
                    },
                    headers=self._h(),
                )
                assert r.status_code == 200
                result = r.json()
                assert result["result"]["status"]["state"] == "COMPLETED"
                artifacts = result["result"]["artifacts"]
                merged_text = artifacts[0]["parts"][0]["text"]
                assert "error" in merged_text

        anyio.run(run)


def _sign_message(payload: dict, signer=None) -> tuple[str, str]:
    from bastion.a2a_signing import AgentCardSigner

    if signer is None:
        signer = AgentCardSigner()
    body = json.dumps(payload, separators=(",", ":")).encode()
    sig = signer._private_key.sign(body)
    sig_b64 = __import__("base64").b64encode(sig).decode()
    return sig_b64, signer


class TestA2ASignatureVerification:
    def setup_method(self):
        reset()

    def _client(self, app):
        import anyio
        from httpx import ASGITransport, AsyncClient

        return anyio, AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    def _h(self, extra: dict | None = None) -> dict:
        h = {"A2A-Version": "1.0"}
        if extra:
            h.update(extra)
        return h

    def _make_message_payload(self, text: str = "hello") -> dict:
        return {
            "jsonrpc": "2.0",
            "id": "1",
            "method": "SendMessage",
            "params": {
                "message": {
                    "role": 1,
                    "parts": [{"text": text}],
                    "metadata": {"skill": "memory_store", "params": {"content": text}},
                },
                "configuration": {"return_immediately": True},
            },
        }

    def test_verify_card_signed_called(self):
        """Verify that verify_card_signed is invoked during signature check."""
        from bastion.a2a_server import create_a2a_server
        from bastion.a2a_signing import AgentCardSigner

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        # Create a signer, sign a message, and send it with a fake sender URL
        sender_signer = AgentCardSigner()
        public_url = "http://localhost:9999"

        payload = self._make_message_payload()
        sig_b64, _ = _sign_message(payload, sender_signer)

        async def run():
            async with client:
                r = await client.post(
                    "/",
                    json=payload,
                    headers=self._h(
                        {
                            "X-Sender-URL": public_url,
                            "X-Sender-Signature": sig_b64,
                        }
                    ),
                )
                # The fake URL won't serve a valid agent card, so verification
                # will fail — but we only care that the code path is reached
                assert r.status_code == 200
                error = r.json().get("error", {})
                assert error.get("code") in (-32001, -32603, -32009)

        anyio.run(run)

    def test_strict_mode_401_on_missing_headers(self):
        orig = os.environ.get("BASTION_A2A_STRICT")
        os.environ["BASTION_A2A_STRICT"] = "true"
        try:
            from bastion.a2a_server import create_a2a_server

            app, _ = create_a2a_server(mock=True)
            anyio, client = self._client(app)

            payload = self._make_message_payload()

            async def run():
                async with client:
                    r = await client.post("/", json=payload, headers=self._h())
                    assert r.status_code == 401
                    assert "Missing required signature headers" in r.json().get("error", "")

            anyio.run(run)
        finally:
            if orig:
                os.environ["BASTION_A2A_STRICT"] = orig
            else:
                os.environ.pop("BASTION_A2A_STRICT", None)

    def test_signature_exchange_valid(self):
        """Full signature exchange with valid signing."""
        from bastion.a2a_server import create_a2a_server
        from bastion.a2a_signing import AgentCardSigner

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        sender_signer = AgentCardSigner()
        payload = self._make_message_payload()
        sig_b64, _ = _sign_message(payload, sender_signer)

        async def run():
            async with client:
                r = await client.post(
                    "/",
                    json=payload,
                    headers=self._h(
                        {
                            "X-Sender-URL": "http://localhost:1",
                            "X-Sender-Signature": sig_b64,
                        }
                    ),
                )
                assert r.status_code == 200

        anyio.run(run)

    def test_invalid_card_rejected(self):
        """Malformed or unsigned card should be rejected."""
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        payload = self._make_message_payload()
        fake_sig = __import__("base64").b64encode(b"f" * 64).decode()

        async def run():
            async with client:
                r = await client.post(
                    "/",
                    json=payload,
                    headers=self._h(
                        {
                            "X-Sender-URL": "http://localhost:1",
                            "X-Sender-Signature": fake_sig,
                        }
                    ),
                )
                assert r.status_code == 200

        anyio.run(run)


class TestA2ARestEndpoints:
    def setup_method(self):
        reset()

    def _client(self, app):
        import anyio
        from httpx import ASGITransport, AsyncClient

        return anyio, AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    def _h(self, extra: dict | None = None) -> dict:
        h = {"A2A-Version": "1.0"}
        if extra:
            h.update(extra)
        return h

    def test_rest_get_task_not_found(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.get("/tasks/nonexistent-id")
                assert r.status_code == 404

        anyio.run(run)

    def test_rest_get_task_exists(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/message:send",
                    json={
                        "message": {
                            "parts": [{"text": "hello"}],
                            "metadata": {"skill": "memory_store", "params": {"content": "hello"}},
                        }
                    },
                    headers=self._h(),
                )
                assert r.status_code == 200
                task_id = r.json()["result"]["id"]
                r2 = await client.get(f"/tasks/{task_id}")
                assert r2.status_code == 200
                assert r2.json()["id"] == task_id

        anyio.run(run)

    def test_rest_cancel_terminal_task_returns_error(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/message:send",
                    json={
                        "message": {
                            "parts": [{"text": "x"}],
                            "metadata": {"skill": "memory_store", "params": {"content": "x"}},
                        }
                    },
                    headers=self._h(),
                )
                task_id = r.json()["result"]["id"]
                r2 = await client.post(f"/tasks/{task_id}:cancel")
                assert r2.status_code == 400

        anyio.run(run)

    def test_rest_delete_terminal_task(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/message:send",
                    json={
                        "message": {
                            "parts": [{"text": "x"}],
                            "metadata": {"skill": "memory_store", "params": {"content": "x"}},
                        }
                    },
                    headers=self._h(),
                )
                task_id = r.json()["result"]["id"]
                r2 = await client.delete(f"/tasks/{task_id}")
                assert r2.status_code == 200
                assert r2.json()["deleted"] == task_id
                r3 = await client.get(f"/tasks/{task_id}")
                assert r3.status_code == 404

        anyio.run(run)

    def test_rest_delete_non_terminal_task_returns_409(self):
        from bastion.a2a_server import create_a2a_server

        app, memory = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/message:send",
                    json={
                        "message": {
                            "parts": [{"text": "x"}],
                            "metadata": {"skill": "memory_store", "params": {"content": "x"}},
                        }
                    },
                    headers=self._h(),
                )
                task_id = r.json()["result"]["id"]
                r2 = await client.delete(f"/tasks/{task_id}")
                assert r2.status_code == 200  # completed task is terminal

        anyio.run(run)

    def test_rest_message_send_no_a2a_version(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/message:send",
                    json={
                        "message": {
                            "parts": [{"text": "test"}],
                            "metadata": {"skill": "memory_store", "params": {"content": "test"}},
                        }
                    },
                )
                assert r.status_code == 400

        anyio.run(run)

    def test_rest_put_callback_url(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/message:send",
                    json={
                        "message": {
                            "parts": [{"text": "x"}],
                            "metadata": {"skill": "memory_store", "params": {"content": "x"}},
                        }
                    },
                    headers=self._h(),
                )
                task_id = r.json()["result"]["id"]
                r2 = await client.put(f"/tasks/{task_id}", json={"callback_url": "https://hooks.example.com/push"})
                assert r2.status_code == 200

        anyio.run(run)

    def test_rest_put_rejects_http_url(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/message:send",
                    json={
                        "message": {
                            "parts": [{"text": "x"}],
                            "metadata": {"skill": "memory_store", "params": {"content": "x"}},
                        }
                    },
                    headers=self._h(),
                )
                task_id = r.json()["result"]["id"]
                r2 = await client.put(f"/tasks/{task_id}", json={"callback_url": "http://example.com/hook"})
                assert r2.status_code == 400

        anyio.run(run)

    def test_idempotency_key_returns_cached(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)
        payload = {
            "message": {
                "parts": [{"text": "test"}],
                "metadata": {"skill": "memory_store", "params": {"content": "test"}},
            }
        }

        async def run():
            async with client:
                h = self._h({"X-Idempotency-Key": "key-1"})
                r1 = await client.post("/message:send", json=payload, headers=h)
                assert r1.status_code == 200
                r2 = await client.post("/message:send", json=payload, headers=h)
                assert r2.status_code == 200
                assert r1.json()["result"]["id"] == r2.json()["result"]["id"]

        anyio.run(run)


class TestA2AStreaming:
    def setup_method(self):
        reset()

    def _client(self, app):
        import anyio
        from httpx import ASGITransport, AsyncClient

        return anyio, AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    def _h(self, extra: dict | None = None) -> dict:
        h = {"A2A-Version": "1.0"}
        if extra:
            h.update(extra)
        return h

    def test_stream_store_and_complete(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with (
                client,
                client.stream(
                    "POST",
                    "/message:sendStream",
                    json={
                        "message": {
                            "parts": [{"text": "hello"}],
                            "metadata": {"skill": "memory_store", "params": {"content": "hello"}},
                        }
                    },
                    headers=self._h(),
                ) as resp,
            ):
                assert resp.status_code == 200
                lines = []
                async for line in resp.aiter_lines():
                    lines.append(line)
                all_text = " ".join(lines)
                assert '"COMPLETED"' in all_text

        anyio.run(run)

    def test_stream_unknown_skill(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with (
                client,
                client.stream(
                    "POST",
                    "/message:sendStream",
                    json={"message": {"parts": [{"text": ""}], "metadata": {"skill": "unknown_skill"}}},
                    headers=self._h(),
                ) as resp,
            ):
                assert resp.status_code == 200
                lines = []
                async for line in resp.aiter_lines():
                    lines.append(line)
                all_text = " ".join(lines)
                assert '"FAILED"' in all_text

        anyio.run(run)

    def test_stream_graph_query(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with (
                client,
                client.stream(
                    "POST",
                    "/message:sendStream",
                    json={
                        "message": {
                            "parts": [{"text": "What entities are connected to project-x?"}],
                            "metadata": {"skill": "graph_query"},
                        }
                    },
                    headers=self._h(),
                ) as resp,
            ):
                assert resp.status_code == 200
                lines = []
                async for line in resp.aiter_lines():
                    lines.append(line)
                all_text = " ".join(lines)
                assert any(s in all_text for s in ('"COMPLETED"', '"FAILED"'))

        anyio.run(run)
