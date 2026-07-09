from __future__ import annotations

from unittest import mock

import pytest


@pytest.fixture(autouse=True)
def _reset_groq_client():
    import bastion.groq_callback as gc
    gc._client = None
    gc._HAS_GROQ = False
    yield


class TestGroqCallback:
    def test_groq_chat_no_api_key_fallback(self):
        from bastion.groq_callback import groq_chat

        with mock.patch.dict("os.environ", {}, clear=True):
            result = groq_chat("hello", [])
            assert result.startswith("[mock]")

    def test_groq_chat_mock_fallback(self):
        from bastion.groq_callback import groq_chat

        with mock.patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
            with mock.patch("groq.Groq") as mock_groq:
                mock_groq.side_effect = ImportError("no groq")
                result = groq_chat("hello", [])
                assert result.startswith("[mock]")

    def test_groq_chat_empty_context(self):
        from bastion.groq_callback import groq_chat

        with mock.patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
            with mock.patch("groq.Groq") as mock_groq:
                instance = mock_groq.return_value
                instance.chat.completions.create.return_value.choices[0].message.content = "Hello!"
                result = groq_chat("Hi", [])
                assert result == "Hello!"

    def test_groq_chat_exception_fallback(self):
        from bastion.groq_callback import groq_chat

        with mock.patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
            with mock.patch("groq.Groq") as mock_groq:
                instance = mock_groq.return_value
                instance.chat.completions.create.side_effect = RuntimeError("api down")
                result = groq_chat("Hi", [])
                assert result.startswith("[mock]")

    def test_groq_merge_mocked(self):
        from bastion.groq_callback import groq_merge

        with mock.patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
            with mock.patch("groq.Groq") as mock_groq:
                instance = mock_groq.return_value
                instance.chat.completions.create.return_value.choices[0].message.content = "merged"
                result = groq_merge(["fact A", "fact B"], "test")
                assert result == "merged"

    def test_groq_query_mocked(self):
        from bastion.groq_callback import groq_query

        with mock.patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
            with mock.patch("groq.Groq") as mock_groq:
                instance = mock_groq.return_value
                instance.chat.completions.create.return_value.choices[0].message.content = "answer"
                result = groq_query("what?")
                assert result == "answer"

    def test_groq_query_exception_fallback(self):
        from bastion.groq_callback import groq_query

        with mock.patch.dict("os.environ", {"GROQ_API_KEY": "test-key"}):
            with mock.patch("groq.Groq") as mock_groq:
                instance = mock_groq.return_value
                instance.chat.completions.create.side_effect = RuntimeError("down")
                result = groq_query("what?")
                assert result.startswith("[mock]")
