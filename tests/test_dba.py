from __future__ import annotations

from unittest import mock

import pytest

from bastion.dba import AutonomousDBA, SchemaEvolution


class TestAutonomousDBA:
    def test_no_cluster_id(self):
        dba = AutonomousDBA()
        result = dba.inspect_query_latency()
        assert result.get("error") == "No cluster_id configured"

    def test_invalid_cluster_id_format(self):
        dba = AutonomousDBA(cluster_id="$(rm -rf /)")
        result = dba.inspect_query_latency()
        assert "Invalid cluster_id" in result.get("error", "")

    def test_health_check_no_cluster(self):
        dba = AutonomousDBA()
        result = dba.health_check()
        assert "cluster_id" in result

    def test_default_threshold(self):
        dba = AutonomousDBA()
        assert dba.threshold_ms == 150

    def test_auto_scale_default(self):
        dba = AutonomousDBA()
        assert dba.auto_scale is True

    def test_scale_up_no_cluster(self):
        dba = AutonomousDBA()
        result = dba.scale_up_cluster(storage_gib=10)
        assert result.get("error") == "No cluster_id configured"

    def test_get_cluster_status_no_cluster(self):
        dba = AutonomousDBA()
        result = dba.get_cluster_status()
        assert result.get("error") == "No cluster_id configured"

    def test_scale_up_cooldown(self):
        dba = AutonomousDBA(cluster_id="valid-cluster-id")
        from datetime import UTC, datetime
        dba._last_scale_time = datetime.now(UTC)
        result = dba.scale_up_cluster(storage_gib=10)
        assert "cooldown" in result.get("error", "")


class TestSchemaEvolution:
    def test_validate_valid_proposal(self):
        se = SchemaEvolution()
        result = se.validate_proposal("users", "email", "TEXT")
        assert result["valid"] is True

    def test_validate_invalid_table_name(self):
        se = SchemaEvolution()
        result = se.validate_proposal("", "col", "TEXT")
        assert result["valid"] is False

    def test_validate_invalid_column_type(self):
        se = SchemaEvolution()
        result = se.validate_proposal("users", "col", "BLOB")
        assert result["valid"] is False

    def test_execute_migration_no_cluster(self):
        se = SchemaEvolution()
        result = se.execute_migration("users", "col", "TEXT")
        assert result.get("error") == "No cluster_id configured"

    def test_execute_rejects_invalid(self):
        se = SchemaEvolution()
        result = se.execute_migration("", "col", "TEXT")
        assert result.get("status") == "rejected"

    def test_validate_column_name_too_long(self):
        se = SchemaEvolution()
        result = se.validate_proposal("users", "a" * 200, "TEXT")
        assert result["valid"] is False

    def test_validate_empty_column_name(self):
        se = SchemaEvolution()
        result = se.validate_proposal("users", "", "TEXT")
        assert result["valid"] is False

    def test_default_value_validation(self):
        se = SchemaEvolution(cluster_id="valid-cluster-id")
        path = "bastion.dba.SchemaEvolution._validate_default_value"
        with mock.patch(path, return_value="unsafe character"):
            result = se.execute_migration("users", "col", "TEXT", default_value="DROP TABLE")
        assert result.get("status") == "rejected"
