from __future__ import annotations

import hashlib
import math
import os
import threading
from typing import Any

import httpx

from bastion.log_setup import get_logger

logger = get_logger(__name__)

HF_MODEL = os.environ.get("BASTION_HF_MODEL", "BAAI/bge-large-en-v1.5")
HF_TOKEN = os.environ.get("HF_TOKEN") or None
HF_API_URL = f"https://router.huggingface.co/hf-inference/models/{HF_MODEL}"

TARGET_DIM = 1024


def _embed_hf(text: str) -> list[float] | None:
    if not HF_TOKEN:
        return None
    headers = {"Authorization": f"Bearer {HF_TOKEN}"}
    payload = {"inputs": text, "parameters": {}, "options": {"wait_for_model": True}}
    try:
        resp = httpx.post(HF_API_URL, json=payload, headers=headers, timeout=30.0)
        if resp.status_code == 503:
            resp = httpx.post(HF_API_URL, json=payload, headers=headers, timeout=60.0)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list) and data and isinstance(data[0], (list, float)):
                emb = data[0] if isinstance(data[0], list) else data
            else:
                return None
            return _ensure_dim(emb)
        logger.debug("HF API error %d: %s", resp.status_code, resp.text[:200])
        return None
    except Exception as exc:
        logger.debug("HF embedding failed: %s", exc)
        return None


_local_model: Any = None
_local_model_lock = threading.Lock()


def _embed_local(text: str) -> list[float] | None:
    global _local_model
    if _local_model is None:
        with _local_model_lock:
            if _local_model is None:
                try:
                    from sentence_transformers import SentenceTransformer
                    _local_model = SentenceTransformer("all-MiniLM-L6-v2")
                except Exception:
                    return None
    try:
        emb = _local_model.encode(text).tolist()
        return _ensure_dim(emb)
    except Exception as exc:
        logger.debug("Local embedding failed: %s", exc)
        return None


def _ensure_dim(emb: list[float]) -> list[float]:
    if len(emb) == TARGET_DIM:
        return emb
    if len(emb) > TARGET_DIM:
        return emb[:TARGET_DIM]
    raw = list(emb)
    digest = hashlib.sha256(str(emb).encode()).digest()
    while len(raw) < TARGET_DIM:
        for byte in digest:
            raw.append(float(byte) / 127.5 - 1.0)
    norm = math.sqrt(sum(v * v for v in raw)) or 1.0
    return [v / norm for v in raw[:TARGET_DIM]]


def _hash_fallback_embed(text: str) -> list[float]:
    """Character n-gram feature-hashing embedding (1024-dim).

    Unlike a whole-text digest (which gives zero similarity signal), this
    hashes character n-grams into a fixed-dimension bag-of-ngrams vector, so
    semantically overlapping texts still produce cosine-similar vectors. This
    keeps the C-SPANN semantic-search demo meaningful in no-network sandboxes
    where the HuggingFace / sentence-transformers backends are unavailable.
    """
    raw = [0.0] * TARGET_DIM
    norm_utf8 = text.lower().strip().encode("utf-8")
    for n in (2, 3, 4):
        for i in range(len(norm_utf8) - n + 1):
            gram = norm_utf8[i : i + n]
            digest = hashlib.sha256(gram).digest()
            idx = int.from_bytes(digest[:4], "big") % TARGET_DIM
            sign = 1.0 if digest[4] & 0x80 else -1.0
            raw[idx] += sign
    norm = math.sqrt(sum(v * v for v in raw)) or 1.0
    return [v / norm for v in raw]
