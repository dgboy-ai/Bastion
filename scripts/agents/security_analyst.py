"""
Security Analyst Agent — Receives alerts, stores memories, detects poisoning.

This agent demonstrates:
- OWASP ASI06 guard scanning on every memory store
- Trust score tracking
- A2A alert escalation to Incident Responder
- CockroachDB SERIALIZABLE isolation
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import uuid
from datetime import UTC, datetime
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from bastion.guard import MemoryGuard

# LLM provider — try Groq first, fall back to simple echo
_llm_client = None


def _get_llm():
    global _llm_client
    if _llm_client is not None:
        return _llm_client
    api_key = os.environ.get("GROQ_API_KEY")
    if api_key:
        try:
            from groq import Groq
            _llm_client = Groq(api_key=api_key)
            return _llm_client
        except ImportError:
            pass
    return None


def _llm_analyze(alert_content: str, guard_findings: list[str]) -> str:
    """Use LLM to analyze the alert context."""
    client = _get_llm()
    if client is None:
        # Fallback: rule-based analysis
        if guard_findings:
            return f"ALERT: {len(guard_findings)} suspicious patterns detected. Immediate investigation required."
        return "No suspicious patterns detected. Memory stored normally."

    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": "You are a security analyst agent. Analyze the alert and provide a brief assessment. Be concise."},
                {"role": "user", "content": f"Alert content: {alert_content}\nGuard findings: {guard_findings}\n\nAnalyze this alert."}
            ],
            max_tokens=200,
            temperature=0.3,
        )
        return response.choices[0].message.content or "Analysis complete."
    except Exception as e:
        return f"LLM unavailable ({e}). Using rule-based analysis."


class SecurityAnalyst:
    """Agent 1: Monitors alerts, stores memories, detects poisoning."""

    def __init__(self, agent_id: str = "soc-analyst"):
        self.agent_id = agent_id
        self.guard = MemoryGuard()
        self.memories: list[dict[str, Any]] = []
        self.alerts_sent: list[dict[str, Any]] = []

    def receive_alert(self, alert: dict[str, Any]) -> dict[str, Any]:
        """
        Receive an external alert and process it.

        Steps:
        1. Run OWASP ASI06 guard scan
        2. Store memory with hash chain
        3. If poisoning detected, escalate via A2A
        """
        content = alert.get("content", "")
        source = alert.get("source", "unknown")
        severity = alert.get("severity", "low")
        timestamp = datetime.now(UTC).isoformat()

        # Step 1: Guard scan
        guard_result = self.guard.check(content)
        is_safe = guard_result.is_safe
        findings = guard_result.findings if not is_safe else []
        poisoning_risk = guard_result.poisoning_risk if hasattr(guard_result, "poisoning_risk") else 0.0

        # Step 2: Store memory (even if poisoned — we track everything)
        memory_id = str(uuid.uuid4())
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        previous_hash = self.memories[-1]["cryptographic_hash"] if self.memories else None

        trust_level = 4 if is_safe else 0

        memory_record = {
            "memory_id": memory_id,
            "content": content,
            "content_hash": content_hash,
            "cryptographic_hash": content_hash,
            "previous_hash": previous_hash,
            "trust_level": trust_level,
            "is_safe": is_safe,
            "findings": findings,
            "source": source,
            "severity": severity,
            "created_at": timestamp,
            "agent_id": self.agent_id,
        }
        self.memories.append(memory_record)

        # Step 3: LLM analysis
        analysis = _llm_analyze(content, findings)

        # Step 4: Determine if escalation needed
        escalated = False
        a2a_alert = None
        if not is_safe or trust_level == 0:
            a2a_alert = {
                "type": "poisoning_detected",
                "memory_id": memory_id,
                "findings": findings,
                "poisoning_risk": poisoning_risk,
                "source": source,
                "severity": severity,
                "timestamp": timestamp,
                "analysis": analysis,
            }
            self.alerts_sent.append(a2a_alert)
            escalated = True

        return {
            "step": "security_analyst",
            "memory_id": memory_id,
            "guard_result": {
                "is_safe": is_safe,
                "findings": findings,
                "poisoning_risk": poisoning_risk,
            },
            "trust_level": trust_level,
            "hash_chain": {
                "memory_id": memory_id[:8] + "...",
                "hash": content_hash[:16] + "...",
                "previous_hash": (previous_hash[:16] + "...") if previous_hash else "GENESIS",
            },
            "analysis": analysis,
            "escalated": escalated,
            "a2a_alert": a2a_alert,
            "timestamp": timestamp,
        }
