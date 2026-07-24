"""Automatic Capture Hooks — Lifecycle-based memory capture.

Instead of requiring manual memory.store() calls, hooks automatically
capture memories at key lifecycle events: after tool calls, after
conversation turns, after errors, and on schedule.

Usage:
    hooks = CaptureHooks(memory_engine)
    hooks.after_tool_call("memory_search", {"query": "test"}, {"results": 5})
    hooks.after_conversation_turn("user", "What is CockroachDB?")
    hooks.after_error("timeout", "Connection timed out")
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


@dataclass
class CaptureEvent:
    """A captured lifecycle event."""
    event_type: str  # "tool_call", "conversation_turn", "error", "scheduled"
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_type": self.event_type,
            "content": self.content,
            "metadata": self.metadata,
            "timestamp": self.timestamp,
        }


class CaptureHooks:
    """Automatic memory capture at lifecycle boundaries.

    Provides hooks that agents call at key points in their execution
    to automatically store memories without manual store() calls.
    """

    def __init__(
        self,
        memory_engine: Any,
        auto_capture_tool_calls: bool = True,
        auto_capture_conversations: bool = True,
        auto_capture_errors: bool = True,
        min_content_length: int = 10,
        dedup_window_seconds: int = 60,
    ):
        self._memory = memory_engine
        self._auto_tool_calls = auto_capture_tool_calls
        self._auto_conversations = auto_capture_conversations
        self._auto_errors = auto_capture_errors
        self._min_content_length = min_content_length
        self._dedup_window = dedup_window_seconds
        self._recent_contents: list[tuple[str, float]] = []
        self._capture_count = 0

    def after_tool_call(
        self,
        tool_name: str,
        arguments: dict[str, Any] | None = None,
        result: dict[str, Any] | None = None,
    ) -> CaptureEvent | None:
        """Capture memory after a tool call completes.

        Stores a summary of what the agent did and what happened.
        """
        if not self._auto_tool_calls:
            return None

        # Build content from tool call
        content = f"Tool '{tool_name}' was called"
        if arguments:
            # Truncate large arguments
            arg_summary = json.dumps(arguments, default=str)[:200]
            content += f" with arguments: {arg_summary}"
        if result:
            result_summary = json.dumps(result, default=str)[:200]
            content += f" → result: {result_summary}"

        if len(content) < self._min_content_length:
            return None

        # Dedup check
        if self._is_duplicate(content):
            return None

        event = CaptureEvent(
            event_type="tool_call",
            content=content,
            metadata={
                "tool_name": tool_name,
                "arguments_keys": list(arguments.keys()) if arguments else [],
                "result_keys": list(result.keys()) if result else [],
            },
        )

        self._store_event(event, memory_type="tool_execution")
        return event

    def after_conversation_turn(
        self,
        role: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> CaptureEvent | None:
        """Capture memory after a conversation turn.

        Stores key information from user/assistant messages.
        """
        if not self._auto_conversations:
            return None

        if not content or len(content) < self._min_content_length:
            return None

        # Truncate very long messages
        truncated = content[:500]
        if len(content) > 500:
            truncated += "..."

        capture_content = f"[{role}] {truncated}"

        if self._is_duplicate(capture_content):
            return None

        event = CaptureEvent(
            event_type="conversation_turn",
            content=capture_content,
            metadata={
                "role": role,
                "content_length": len(content),
                **(metadata or {}),
            },
        )

        self._store_event(event, memory_type="conversation")
        return event

    def after_error(
        self,
        error_type: str,
        error_message: str,
        context: dict[str, Any] | None = None,
    ) -> CaptureEvent | None:
        """Capture memory after an error occurs.

        Stores error information for future reference and pattern detection.
        """
        if not self._auto_errors:
            return None

        content = f"Error [{error_type}]: {error_message}"
        if context:
            context_summary = json.dumps(context, default=str)[:200]
            content += f" (context: {context_summary})"

        event = CaptureEvent(
            event_type="error",
            content=content,
            metadata={
                "error_type": error_type,
                "error_message": error_message[:500],
                **(context or {}),
            },
        )

        self._store_event(event, memory_type="error_log")
        return event

    def after_file_read(self, file_path: str, content_preview: str = "") -> CaptureEvent | None:
        """Capture memory after a file is read by the agent."""
        content = f"File read: {file_path}"
        if content_preview:
            content += f" — {content_preview[:200]}"
        event = CaptureEvent(
            event_type="file_read",
            content=content,
            metadata={"file_path": file_path, "preview_length": len(content_preview)},
        )
        self._store_event(event, memory_type="file_access")
        return event

    def after_file_write(self, file_path: str, content_preview: str = "") -> CaptureEvent | None:
        """Capture memory after a file is written by the agent."""
        content = f"File written: {file_path}"
        if content_preview:
            content += f" — {content_preview[:200]}"
        event = CaptureEvent(
            event_type="file_write",
            content=content,
            metadata={"file_path": file_path, "preview_length": len(content_preview)},
        )
        self._store_event(event, memory_type="file_access")
        return event

    def after_command(self, command: str, exit_code: int = 0, output_preview: str = "") -> CaptureEvent | None:
        """Capture memory after a shell command executes."""
        content = f"Command: {command} (exit={exit_code})"
        if output_preview:
            content += f" — {output_preview[:200]}"
        event = CaptureEvent(
            event_type="command",
            content=content,
            metadata={"command": command, "exit_code": exit_code},
        )
        self._store_event(event, memory_type="command_execution")
        return event

    def after_checkpoint(self, checkpoint_id: str, description: str = "") -> CaptureEvent | None:
        """Capture memory after a checkpoint is saved."""
        content = f"Checkpoint saved: {checkpoint_id}"
        if description:
            content += f" — {description}"
        event = CaptureEvent(
            event_type="checkpoint",
            content=content,
            metadata={"checkpoint_id": checkpoint_id},
        )
        self._store_event(event, memory_type="checkpoint")
        return event

    def after_network_request(self, url: str, method: str = "GET", status: int = 200) -> CaptureEvent | None:
        """Capture memory after a network request."""
        content = f"Network {method} {url} → {status}"
        event = CaptureEvent(
            event_type="network_request",
            content=content,
            metadata={"url": url, "method": method, "status": status},
        )
        self._store_event(event, memory_type="network_activity")
        return event

    def after_db_query(self, query: str, rows_affected: int = 0) -> CaptureEvent | None:
        """Capture memory after a database query."""
        content = f"DB query: {query[:200]} — {rows_affected} rows"
        event = CaptureEvent(
            event_type="db_query",
            content=content,
            metadata={"query_preview": query[:200], "rows_affected": rows_affected},
        )
        self._store_event(event, memory_type="database_activity")
        return event

    def after_session_start(self, session_id: str = "", context: str = "") -> CaptureEvent | None:
        """Capture memory at session start."""
        content = f"Session started: {session_id}"
        if context:
            content += f" — {context[:200]}"
        event = CaptureEvent(
            event_type="session_start",
            content=content,
            metadata={"session_id": session_id},
        )
        self._store_event(event, memory_type="session_lifecycle")
        return event

    def after_session_end(self, session_id: str = "", summary: str = "") -> CaptureEvent | None:
        """Capture memory at session end."""
        content = f"Session ended: {session_id}"
        if summary:
            content += f" — {summary[:200]}"
        event = CaptureEvent(
            event_type="session_end",
            content=content,
            metadata={"session_id": session_id},
        )
        self._store_event(event, memory_type="session_lifecycle")
        return event

    def after_subagent_start(self, subagent_id: str, task: str = "") -> CaptureEvent | None:
        """Capture memory when a sub-agent is spawned."""
        content = f"Sub-agent started: {subagent_id}"
        if task:
            content += f" — {task[:200]}"
        event = CaptureEvent(
            event_type="subagent_start",
            content=content,
            metadata={"subagent_id": subagent_id, "task": task},
        )
        self._store_event(event, memory_type="agent_coordination")
        return event

    def _store_event(self, event: CaptureEvent, memory_type: str) -> None:
        """Store a capture event as a memory."""
        try:
            self._memory.store(
                memory_type=memory_type,
                content=event.content,
                metadata=event.metadata,
                _skip_guard=True, _guard_bypass_token=True,  # Events are internally generated
            )
            self._capture_count += 1
            self._recent_contents.append((event.content[:100], time.time()))
            # Trim old entries from dedup window
            cutoff = time.time() - self._dedup_window
            self._recent_contents = [
                (c, t) for c, t in self._recent_contents if t >= cutoff
            ]
        except Exception as exc:
            logger.warning("Failed to capture event: %s", exc)

    def _is_duplicate(self, content: str) -> bool:
        """Check if similar content was recently captured."""
        prefix = content[:100]
        return any(rp == prefix for rp, _ in self._recent_contents)

    def get_stats(self) -> dict[str, Any]:
        """Get capture statistics."""
        return {
            "capture_count": self._capture_count,
            "recent_events": len(self._recent_contents),
            "auto_tool_calls": self._auto_tool_calls,
            "auto_conversations": self._auto_conversations,
            "auto_errors": self._auto_errors,
        }
