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
                r = await client.post("/", content=b"not-json", headers={"content-type": "application/json"})
                assert r.status_code == 200
                assert r.json()["error"]["code"] == -32700

        anyio.run(run)

    def test_jsonrpc_version_check(self):
        from bastion.a2a_server import create_a2a_server
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post("/", json={"jsonrpc": "1.0", "method": "tasks/send"})
                assert r.status_code == 200
                assert r.json()["error"]["code"] == -32600

        anyio.run(run)

    def test_method_not_found(self):
        from bastion.a2a_server import create_a2a_server
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post("/", json={"jsonrpc": "2.0", "id": "1", "method": "unknown"})
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
                r = await client.post("/", content=big_payload, headers={"content-type": "application/json"})
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
                r = await client.post("/", json={
                    "jsonrpc": "2.0",
                    "id": "1",
                    "method": "tasks/send",
                    "params": {"message": {"skill": "memory_store", "content": "test"}},
                })
                assert r.status_code == 200
                result = r.json()
                assert result["result"]["status"]["state"] == "completed"

                # Search
                r = await client.post("/", json={
                    "jsonrpc": "2.0",
                    "id": "2",
                    "method": "tasks/send",
                    "params": {"message": {"skill": "memory_search", "query": "test", "k": 3, "threshold": 0.0}},
                })
                assert r.status_code == 200
                result = r.json()
                assert result["result"]["status"]["state"] == "completed"

        anyio.run(run)

    def test_unknown_skill(self):
        from bastion.a2a_server import create_a2a_server
        app, memory = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post("/", json={
                    "jsonrpc": "2.0",
                    "id": "1",
                    "method": "tasks/send",
                    "params": {"message": {"skill": "nonexistent"}},
                })
                assert r.status_code == 200
                result = r.json()
                assert result["result"]["status"]["state"] == "failed"

        anyio.run(run)

    def test_tasks_get_returns_task(self):
        from bastion.a2a_server import create_a2a_server
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post("/", json={
                    "jsonrpc": "2.0",
                    "id": "1",
                    "method": "tasks/send",
                    "params": {"message": {"skill": "memory_store", "content": "hello"}},
                })
                assert r.status_code == 200
                task = r.json()["result"]
                task_id = task["id"]

                r = await client.post("/", json={
                    "jsonrpc": "2.0",
                    "id": "2",
                    "method": "tasks/get",
                    "params": {"id": task_id},
                })
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] in ("completed", "working")

        anyio.run(run)

    def test_tasks_get_nonexistent_returns_404(self):
        from bastion.a2a_server import create_a2a_server
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post("/", json={
                    "jsonrpc": "2.0",
                    "id": "1",
                    "method": "tasks/get",
                    "params": {"id": "nonexistent-task-id"},
                })
                assert r.status_code == 404
                assert r.json()["error"]["code"] == -32001

        anyio.run(run)

    def test_tasks_cancel_nonexistent_returns_404(self):
        from bastion.a2a_server import create_a2a_server
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.post("/", json={
                    "jsonrpc": "2.0",
                    "id": "1",
                    "method": "tasks/cancel",
                    "params": {"id": "nonexistent-task-id"},
                })
                assert r.status_code == 404
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
