from __future__ import annotations

import re
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)

_INDIRECT_INSTRUCTION_PATTERNS: list[re.Pattern] = [
    re.compile(r"\b(remember|always|never|must|required|critical)\s*(:|that|to|:)", re.IGNORECASE),
    re.compile(r"\b(instruction|rule|policy|procedure|protocol)\b", re.IGNORECASE),
    re.compile(r"\b(send|forward|upload|delete|modify|change)\s*(all|every|the)", re.IGNORECASE),
    re.compile(r"\b(password|secret|key|token|credential)\s*(=|is|:)", re.IGNORECASE),
]

_SOURCE_TYPES = frozenset({"agent_direct", "rag_document", "tool_output", "user_input", "a2a_message"})


def compute_provenance(
    source_type: str,
    source_url: str | None = None,
    parent_provenance: dict[str, Any] | None = None,
    content: str = "",
) -> dict[str, Any]:
    """Compute a provenance chain for a memory entry.

    Args:
        source_type: One of ``agent_direct``, ``rag_document``, ``tool_output``,
                     ``user_input``, ``a2a_message``.
        source_url: Optional URL or identifier of the source.
        parent_provenance: Provenance of the memory that triggered this one
                          (for MINJA chain analysis).
        content: The memory content, used to compute indirect injection risk.

    Returns:
        A dict with provenance metadata suitable for storing in
        ``agent_memory.metadata``:
        - ``source_type``
        - ``source_url``
        - ``indirect_score`` (0.0 = direct, 1.0 = fully indirect)
        - ``depth`` (hops from original user intent)
        - ``instruction_pattern`` (True if content matches instruction patterns)
    """
    if source_type not in _SOURCE_TYPES:
        source_type = "agent_direct"

    depth = 0
    if parent_provenance:
        depth = parent_provenance.get("depth", 0) + 1

    indirect_score = _compute_indirect_score(source_type, depth)
    instruction_pattern = bool(_detect_instruction_patterns(content))

    if instruction_pattern and source_type != "agent_direct":
        indirect_score = min(1.0, indirect_score + 0.3)
        logger.warning(
            "Indirect instruction pattern detected in RAG-sourced memory",
            extra={"source_type": source_type, "source_url": source_url, "indirect_score": indirect_score},
        )

    return {
        "source_type": source_type,
        "source_url": source_url or "",
        "indirect_score": round(indirect_score, 4),
        "depth": depth,
        "instruction_pattern": instruction_pattern,
    }


def _compute_indirect_score(source_type: str, depth: int) -> float:
    base_scores = {
        "agent_direct": 0.0,
        "user_input": 0.1,
        "tool_output": 0.3,
        "rag_document": 0.5,
        "a2a_message": 0.4,
    }
    base = base_scores.get(source_type, 0.5)
    depth_penalty = min(depth * 0.15, 0.6)
    return min(1.0, base + depth_penalty)


def _detect_instruction_patterns(content: str) -> list[str]:
    if not content:
        return []
    matched = []
    for pattern in _INDIRECT_INSTRUCTION_PATTERNS:
        m = pattern.search(content)
        if m:
            matched.append(m.group()[:50])
    return matched
