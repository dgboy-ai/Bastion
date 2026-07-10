from __future__ import annotations

import os
import threading
from typing import Any

from bastion.log_setup import get_logger
from bastion.models import MemoryRecord

_GROQ_MODEL = os.environ.get("GROQ_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
_HAS_GROQ: bool = False
_client: Any = None
_client_lock = threading.Lock()


def _get_client() -> Any:
    global _client, _HAS_GROQ
    if _client is not None:
        return _client
    with _client_lock:
        if _client is not None:
            return _client
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY not set")
        try:
            from groq import Groq

            _client = Groq(api_key=api_key)
            _HAS_GROQ = True
        except ImportError:
            raise RuntimeError("groq library not installed (pip install groq)") from None
        return _client


_logger = get_logger("bastion.groq")


def groq_chat(user_message: str, context: list[MemoryRecord]) -> str:
    """LLM callback for ``BastionAgent.chat(llm_callback=groq_chat)``."""
    try:
        client = _get_client()
        context_str = "\n".join(f"- {m.content}" for m in context[-10:]) if context else "No prior memories."
        system = "You are Bastion, an AI agent with persistent memory. Respond concisely and accurately."
        prompt = f"Memory context:\n{context_str}\n\nUser: {user_message}"
        resp = client.chat.completions.create(
            model=_GROQ_MODEL,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=512,
            timeout=15,
        )
        return resp.choices[0].message.content or ""
    except Exception:
        _logger.exception("groq_chat failed, falling back to mock")
        return f"[mock] Received: {user_message[:100]}"


def groq_merge(contents: list[str], fact_key: str) -> str:
    """LLM merge callback for ``CRDTMemory(strategy='semantic', llm_merge_callback=groq_merge)``."""
    try:
        client = _get_client()
        facts = "\n".join(f"{i+1}. {c}" for i, c in enumerate(contents))
        prompt = f"Merge these conflicting facts into a single coherent statement:\n\n{facts}\n\nMerged:"
        resp = client.chat.completions.create(
            model=_GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=256,
            timeout=15,
        )
        return resp.choices[0].message.content or contents[0]
    except Exception:
        _logger.exception("groq_merge failed, returning first candidate")
        return contents[0] if contents else fact_key


def groq_query(query: str) -> str:
    """LLM callback for ``BastionMemory.query_with_cache(llm_callback=groq_query)``."""
    try:
        client = _get_client()
        resp = client.chat.completions.create(
            model=_GROQ_MODEL,
            messages=[{"role": "user", "content": query}],
            temperature=0.7,
            max_tokens=1024,
            timeout=15,
        )
        return resp.choices[0].message.content or ""
    except Exception:
        _logger.exception("groq_query failed, falling back to mock")
        return f"[mock] Answer for: {query[:100]}"
