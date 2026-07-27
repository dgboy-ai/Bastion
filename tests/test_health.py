"""Tests for bastion.health module."""

from __future__ import annotations

from unittest.mock import MagicMock


class FakeCursor:
    def __init__(self, rows=None):
        self._rows = rows or []
        self._row_idx = 0

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def execute(self, sql, params=None):
        pass

    def fetchone(self):
        if self._row_idx < len(self._rows):
            row = self._rows[self._row_idx]
            self._row_idx += 1
            return row
        return None

    def fetchall(self):
        return self._rows[self._row_idx :]


class FakePool:
    def __init__(self, cursor=None):
        self._cursor = cursor or FakeCursor()

    def acquire(self, timeout=None):
        conn = MagicMock()
        conn.cursor.return_value = self._cursor
        conn.autocommit = False
        return conn

    def release(self, conn):
        pass


class FakeMemory:
    def __init__(self, agent_id="test-agent", cursor=None):
        self.agent_id = agent_id
        self._pool = FakePool(cursor)
        self._mock = False

    def get_pool(self):
        return self._pool

    def _set_rls_context(self, conn):
        pass

    def get_memory(self, memory_id):
        return None

    def get_at_time(self, timestamp, agent_id=None):
        return []


class TestMemoryHealth:
    def test_health_returns_metrics(self):
        from bastion.health import memory_health_real

        row = (10, 2, 8, 10, 5.0, 7.5)
        cursor = FakeCursor(rows=[row])
        mem = FakeMemory(cursor=cursor)
        result = memory_health_real(mem)

        assert result["total_memories"] == 10
        assert result["pinned_memories"] == 2
        assert result["memories_last_7_days"] == 8
        assert result["freshness_ratio"] == 0.8
        assert result["avg_access_count"] == 5.0
        assert result["avg_importance_score"] == 7.5

    def test_health_empty_db(self):
        from bastion.health import memory_health_real

        row = (0, 0, 0, 0, 0, 0)
        cursor = FakeCursor(rows=[row])
        mem = FakeMemory(cursor=cursor)
        result = memory_health_real(mem)

        assert result["total_memories"] == 0
        assert result["freshness_ratio"] == 0.0

    def test_health_none_values(self):
        from bastion.health import memory_health_real

        row = (None, None, None, None, None, None)
        cursor = FakeCursor(rows=[row])
        mem = FakeMemory(cursor=cursor)
        result = memory_health_real(mem)

        assert result["total_memories"] == 0
        assert result["freshness_ratio"] == 0.0


class TestTrustReport:
    def test_trust_report_not_found(self):
        from bastion.health import trust_report_real

        mem = FakeMemory()
        result = trust_report_real(mem, "nonexistent-id")

        assert result["error"] == "not_found"
        assert result["memory_id"] == "nonexistent-id"


class TestAnomalies:
    def test_anomaly_detection_no_anomalies(self):
        from bastion.health import detect_anomalies_real

        count_row = (5,)
        content_rows = [("content1",), ("content2",), ("content3",), ("content4",), ("content5",)]
        cursor = FakeCursor(rows=[count_row] + content_rows)
        mem = FakeMemory(cursor=cursor)

        alerts = detect_anomalies_real(mem, "test-agent")
        assert isinstance(alerts, list)
        assert len(alerts) == 0

    def test_anomaly_detection_size_spike(self):
        from bastion.health import detect_anomalies_real

        count_row = (150,)
        content_rows = [("content1",), ("content2",)]
        cursor = FakeCursor(rows=[count_row] + content_rows)
        mem = FakeMemory(cursor=cursor)

        alerts = detect_anomalies_real(mem, "test-agent")
        assert any(a["type"] == "size_spike" for a in alerts)

    def test_anomaly_detection_duplicates(self):
        from bastion.health import detect_anomalies_real

        count_row = (5,)
        content_rows = [("same_content",), ("same_content",), ("different",), ("other",), ("unique",)]
        cursor = FakeCursor(rows=[count_row] + content_rows)
        mem = FakeMemory(cursor=cursor)

        alerts = detect_anomalies_real(mem, "test-agent")
        assert any(a["type"] == "fact_turnover" for a in alerts)


class TestDiff:
    def test_diff_returns_structure(self):
        from bastion.health import diff_real

        mem = FakeMemory()

        result = diff_real(mem, "test-agent", "1 hour ago", "now")

        assert result["agent_id"] == "test-agent"
        assert "added" in result
        assert "removed" in result
        assert result["count_a"] == 0
        assert result["count_b"] == 0
