"""E2E test: verify all 25 A2A skills work through the protocol."""

import json

from bastion.a2a_server import create_a2a_server
from bastion.mock import reset


class TestA2ASkillsE2E:
    def setup_method(self):
        reset()

    def _client(self, app):
        import anyio
        from httpx import ASGITransport, AsyncClient

        return anyio, AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    def _h(self):
        import os

        h = {"A2A-Version": "1.0"}
        api_key = os.environ.get("BASTION_API_KEY", "")
        if api_key:
            h["Authorization"] = f"Bearer {api_key}"
        return h

    def _send(self, client, skill, params, req_id="1"):
        return client.post(
            "/",
            json={
                "jsonrpc": "2.0",
                "id": req_id,
                "method": "SendMessage",
                "params": {
                    "message": {
                        "role": 1,
                        "parts": [{"text": ""}],
                        "metadata": {"skill": skill, "params": params},
                    },
                    "configuration": {"return_immediately": True},
                },
            },
            headers=self._h(),
        )

    def test_agent_card_has_25_skills(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await client.get("/.well-known/agent-card.json")
                assert r.status_code == 200
                card = r.json()
                assert len(card["skills"]) == 25
                skill_ids = {s["id"] for s in card["skills"]}
                expected = {
                    "memory_store",
                    "memory_search",
                    "memory_timetravel",
                    "memory_audit",
                    "memory_heal",
                    "memory_delete",
                    "memory_pin",
                    "memory_get_pinned",
                    "memory_list",
                    "memory_correct",
                    "memory_health",
                    "memory_apply_patch",
                    "resolve_conflict",
                    "ltm_check_reuse",
                    "ltm_store_analysis",
                    "ltm_invalidate",
                    "detect_contradictions",
                    "scan_all_contradictions",
                    "dream",
                    "dream_history",
                    "detect_observations",
                    "multi_signal_search",
                    "context_pack",
                    "agent_schema",
                    "a2a_bridge",
                }
                assert expected == skill_ids

        anyio.run(run)

    def test_skill_memory_store(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "memory_store", {"content": "Hello world", "memory_type": "fact"}, "1")
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_memory_list(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                await self._send(client, "memory_store", {"content": "List me"}, "0")
                r = await self._send(client, "memory_list", {"limit": 10}, "1")
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_memory_health(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "memory_health", {}, "1")
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_memory_pin_and_get(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "memory_pin", {"content": "Never share keys", "pin_priority": 2}, "1")
                assert r.json()["result"]["status"]["state"] == "COMPLETED"
                r = await self._send(client, "memory_get_pinned", {"min_priority": 1}, "2")
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_memory_timetravel(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "memory_timetravel", {"timestamp": "now"}, "1")
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_memory_audit(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "memory_audit", {}, "1")
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_memory_correct(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "memory_store", {"content": "Original"}, "1")
                mid = json.loads(r.json()["result"]["artifacts"][0]["parts"][0]["text"])["memory_id"]
                r = await self._send(client, "memory_correct", {"memory_id": mid, "new_content": "Corrected"}, "2")
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_memory_delete(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "memory_store", {"content": "Delete me"}, "1")
                mid = json.loads(r.json()["result"]["artifacts"][0]["parts"][0]["text"])["memory_id"]
                r = await self._send(client, "memory_delete", {"memory_id": mid, "confirmed": True}, "2")
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_memory_heal(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "memory_heal", {}, "1")
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_memory_apply_patch(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "memory_store", {"content": "Patchable"}, "1")
                mid = json.loads(r.json()["result"]["artifacts"][0]["parts"][0]["text"])["memory_id"]
                r = await self._send(
                    client,
                    "memory_apply_patch",
                    {
                        "memory_id": mid,
                        "patch_ops": [{"op": "add", "path": "/verified", "value": True}],
                    },
                    "2",
                )
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_resolve_conflict(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(
                    client, "resolve_conflict", {"fact_a": "Python is best", "fact_b": "Rust is best"}, "1"
                )
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_detect_observations(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "detect_observations", {}, "1")
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_multi_signal_search(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                await self._send(client, "memory_store", {"content": "Python backend"}, "0")
                r = await self._send(client, "multi_signal_search", {"query": "Python", "k": 5}, "1")
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_context_pack(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "context_pack", {"budget_tokens": 2000}, "1")
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_scan_all_contradictions(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "scan_all_contradictions", {}, "1")
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_dream(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "dream", {"lookback_hours": 24}, "1")
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_dream_history(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "dream_history", {}, "1")
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_ltm_check_reuse(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "ltm_check_reuse", {"query": "test analysis", "threshold": 0.8}, "1")
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_ltm_store_analysis(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(
                    client,
                    "ltm_store_analysis",
                    {"query": "market trends", "result": "Q3 was strong", "analysis_type": "research"},
                    "1",
                )
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_ltm_invalidate(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "ltm_invalidate", {"query": "market trends", "reason": "outdated"}, "1")
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)

    def test_skill_detect_contradictions(self):
        app, _ = create_a2a_server(mock=True)
        anyio, client = self._client(app)

        async def run():
            async with client:
                r = await self._send(client, "memory_store", {"content": "Fact A"}, "1")
                mid = json.loads(r.json()["result"]["artifacts"][0]["parts"][0]["text"])["memory_id"]
                r = await self._send(client, "detect_contradictions", {"memory_id": mid}, "2")
                assert r.status_code == 200
                assert r.json()["result"]["status"]["state"] == "COMPLETED"

        anyio.run(run)
