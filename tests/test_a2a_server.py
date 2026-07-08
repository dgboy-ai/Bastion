"""Tests for the A2A protocol server."""

from __future__ import annotations

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
        # Directly test that store_a2a_task accepts and returns callback_url
        record = memory.store_a2a_task("task-cb-1", "agent-1", "memory_store", "WORKING", "https://example.com/hook")
        assert record["callback_url"] == "https://example.com/hook"
        assert record["task_id"] == "task-cb-1"
        assert record["status"] == "WORKING"
