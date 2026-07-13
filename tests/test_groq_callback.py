"""Tests for groq_callback — fallback behavior without real API."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest

from bastion.groq_callback import groq_chat, groq_merge, groq_query, _get_client, _client, _client_lock
from bastion.models import MemoryRecord


class TestGroqChat:
    def test_returns_response(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}, clear=False):
            import bastion.groq_callback as mod
            mod._client = None  # Reset cached client

            mock_client = MagicMock()
            mock_resp = MagicMock()
            mock_resp.choices = [MagicMock(message=MagicMock(content="Hello!"))]
            mock_client.chat.completions.create.return_value = mock_resp

            with patch.object(mod, "_get_client", return_value=mock_client):
                result = groq_chat("Hi there", [])
                assert result == "Hello!"

    def test_returns_context_in_prompt(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}, clear=False):
            import bastion.groq_callback as mod
            mock_client = MagicMock()
            mock_resp = MagicMock()
            mock_resp.choices = [MagicMock(message=MagicMock(content="Response"))]
            mock_client.chat.completions.create.return_value = mock_resp

            ctx = [MemoryRecord(memory_id="1", agent_id="a", memory_type="fact", content="ctx1")]
            with patch.object(mod, "_get_client", return_value=mock_client):
                result = groq_chat("Question", ctx)
                assert result == "Response"
                # Verify context was included in the prompt
                call_args = mock_client.chat.completions.create.call_args
                messages = call_args.kwargs.get("messages") or call_args[1].get("messages")
                user_msg = [m for m in messages if m["role"] == "user"][0]["content"]
                assert "ctx1" in user_msg

    def test_fallback_on_error(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}, clear=False):
            import bastion.groq_callback as mod
            mock_client = MagicMock()
            mock_client.chat.completions.create.side_effect = RuntimeError("API down")

            with patch.object(mod, "_get_client", return_value=mock_client):
                result = groq_chat("Hi", [])
                assert "[mock]" in result
                assert "Hi" in result


class TestGroqMerge:
    def test_merges_contents(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}, clear=False):
            import bastion.groq_callback as mod
            mock_client = MagicMock()
            mock_resp = MagicMock()
            mock_resp.choices = [MagicMock(message=MagicMock(content="Merged fact"))]
            mock_client.chat.completions.create.return_value = mock_resp

            with patch.object(mod, "_get_client", return_value=mock_client):
                result = groq_merge(["Fact A", "Fact B"], "key")
                assert result == "Merged fact"

    def test_fallback_returns_first(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}, clear=False):
            import bastion.groq_callback as mod
            mock_client = MagicMock()
            mock_client.chat.completions.create.side_effect = RuntimeError("fail")

            with patch.object(mod, "_get_client", return_value=mock_client):
                result = groq_merge(["A", "B"], "key")
                assert result == "A"

    def test_fallback_empty_returns_key(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}, clear=False):
            import bastion.groq_callback as mod
            mock_client = MagicMock()
            mock_client.chat.completions.create.side_effect = RuntimeError("fail")

            with patch.object(mod, "_get_client", return_value=mock_client):
                result = groq_merge([], "mykey")
                assert result == "mykey"


class TestGroqQuery:
    def test_returns_response(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}, clear=False):
            import bastion.groq_callback as mod
            mock_client = MagicMock()
            mock_resp = MagicMock()
            mock_resp.choices = [MagicMock(message=MagicMock(content="Answer"))]
            mock_client.chat.completions.create.return_value = mock_resp

            with patch.object(mod, "_get_client", return_value=mock_client):
                result = groq_query("What is X?")
                assert result == "Answer"

    def test_fallback_on_error(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}, clear=False):
            import bastion.groq_callback as mod
            mock_client = MagicMock()
            mock_client.chat.completions.create.side_effect = RuntimeError("fail")

            with patch.object(mod, "_get_client", return_value=mock_client):
                result = groq_query("What is X?")
                assert "[mock]" in result
                assert "What is X?" in result


class TestGetClient:
    def test_raises_without_api_key(self):
        with patch.dict(os.environ, {}, clear=True):
            import bastion.groq_callback as mod
            mod._client = None
            with pytest.raises(RuntimeError, match="GROQ_API_KEY"):
                _get_client()
