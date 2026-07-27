"""Tests for AutonomousDBA and SchemaEvolution — with mocked subprocess."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

from bastion.dba import ALLOWED_COLUMN_TYPES, AutonomousDBA, SchemaEvolution


class TestAutonomousDBA:
    def test_no_cluster_id_returns_error(self):
        dba = AutonomousDBA()
        result = dba.inspect_query_latency()
        assert "error" in result
        assert result["slow_queries"] == []

    def test_invalid_cluster_id_returns_error(self):
        dba = AutonomousDBA(cluster_id="'; DROP TABLE--")
        result = dba.inspect_query_latency()
        assert "error" in result

    def test_get_cluster_status_no_cluster(self):
        dba = AutonomousDBA()
        result = dba.get_cluster_status()
        assert "error" in result

    def test_scale_up_no_cluster(self):
        dba = AutonomousDBA()
        result = dba.scale_up_cluster()
        assert "error" in result

    def test_health_check_no_cluster(self):
        dba = AutonomousDBA()
        result = dba.health_check()
        assert "cluster_id" in result
        assert "cluster_status" in result
        assert "query_latency" in result
        assert "recommendations" in result

    @patch("subprocess.run")
    def test_inspect_query_latency_success(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=json.dumps(
                [
                    {"key": "SELECT *", "count": 100, "max_total_time": 5000, "max_service_latency": 200},
                    {"key": "INSERT INTO", "count": 50, "max_total_time": 1000, "max_service_latency": 50},
                ]
            ),
            stderr="",
        )
        dba = AutonomousDBA(cluster_id="test-cluster", threshold_ms=100)
        result = dba.inspect_query_latency()
        assert result["slow_count"] == 1
        assert result["threshold_ms"] == 100
        assert len(result["queries"]) == 1

    @patch("subprocess.run")
    def test_get_cluster_status_success(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=json.dumps({"cluster_id": "test", "status": "ACTIVE"}),
            stderr="",
        )
        dba = AutonomousDBA(cluster_id="test-cluster")
        result = dba.get_cluster_status()
        assert result["cluster_id"] == "test"
        assert result["status"] == "ACTIVE"

    @patch("subprocess.run")
    def test_scale_up_success(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=json.dumps({"status": "scaled"}),
            stderr="",
        )
        dba = AutonomousDBA(cluster_id="test-cluster")
        result = dba.scale_up_cluster(storage_gib=100, num_nodes=3)
        assert result["status"] == "scaled"
        assert result["storage_gib"] == 100
        assert result["num_nodes"] == 3

    def test_scale_cooldown(self):
        from datetime import UTC, datetime

        dba = AutonomousDBA(cluster_id="test-cluster")
        dba._last_scale_time = datetime.now(UTC)
        result = dba.scale_up_cluster()
        assert "error" in result
        assert "retry_after" in result["error"].lower() or "cooldown" in result["error"].lower()

    @patch("subprocess.run")
    def test_recommendations_slow_queries(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=json.dumps([{"key": f"q{i}", "max_service_latency": 200} for i in range(15)]),
            stderr="",
        )
        dba = AutonomousDBA(cluster_id="test-cluster", threshold_ms=100)
        result = dba.health_check()
        assert len(result["recommendations"]) > 0


class TestSchemaEvolution:
    def test_validate_proposal_valid(self):
        se = SchemaEvolution(cluster_id="test")
        result = se.validate_proposal("my_table", "new_col", "TEXT")
        assert result["valid"] is True
        assert result["errors"] == []

    def test_validate_proposal_invalid_table(self):
        se = SchemaEvolution(cluster_id="test")
        result = se.validate_proposal("'; DROP TABLE--", "col", "TEXT")
        assert result["valid"] is False
        assert any("table" in e.lower() for e in result["errors"])

    def test_validate_proposal_invalid_column_type(self):
        se = SchemaEvolution(cluster_id="test")
        result = se.validate_proposal("my_table", "col", "EVIL_TYPE")
        assert result["valid"] is False
        assert any("type" in e.lower() for e in result["errors"])

    def test_validate_proposal_long_table_name(self):
        se = SchemaEvolution(cluster_id="test")
        result = se.validate_proposal("a" * 129, "col", "TEXT")
        assert result["valid"] is False

    def test_allowed_column_types(self):
        assert "TEXT" in ALLOWED_COLUMN_TYPES
        assert "INT" in ALLOWED_COLUMN_TYPES
        assert "JSONB" in ALLOWED_COLUMN_TYPES
        assert "UUID" in ALLOWED_COLUMN_TYPES
        assert "TIMESTAMPTZ" in ALLOWED_COLUMN_TYPES

    def test_execute_migration_rejects_invalid(self):
        se = SchemaEvolution(cluster_id="test")
        result = se.execute_migration("bad-table", "col", "TEXT")
        assert result["status"] == "rejected"

    def test_execute_migration_no_cluster(self):
        se = SchemaEvolution()
        result = se.execute_migration("my_table", "col", "TEXT")
        assert "error" in result

    def test_list_columns_no_cluster(self):
        se = SchemaEvolution()
        result = se.list_columns("my_table")
        assert "error" in result

    def test_list_columns_invalid_table(self):
        se = SchemaEvolution(cluster_id="test")
        result = se.list_columns("'; DROP TABLE--")
        assert "error" in result

    def test_validate_default_value_valid(self):
        se = SchemaEvolution()
        assert se._validate_default_value("'hello'") is None
        assert se._validate_default_value("42") is None
        assert se._validate_default_value("true") is None
        assert se._validate_default_value("CURRENT_TIMESTAMP") is None

    def test_validate_default_value_invalid(self):
        se = SchemaEvolution()
        assert se._validate_default_value("'; DROP TABLE--") is not None
        assert se._validate_default_value("") is not None
        assert se._validate_default_value("a" * 257) is not None
        assert se._validate_default_value("EXEC('evil')") is not None  # Dangerous SQL function blocked
        assert se._validate_default_value("NOW()") is None  # NOW() is a safe CockroachDB default

    def test_validate_table_name_valid(self):
        se = SchemaEvolution()
        assert se._validate_table_name("my_table") is None
        assert se._validate_table_name("Table123") is None

    def test_validate_table_name_invalid(self):
        se = SchemaEvolution()
        assert se._validate_table_name("") is not None
        assert se._validate_table_name("'; DROP TABLE--") is not None
        assert se._validate_table_name("123table") is not None  # starts with digit
