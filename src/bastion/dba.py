"""Autonomous DBA Agent for CockroachDB.

Uses ccloud CLI to manage cluster operations and MCP queries
to inspect database performance. Enables agents to autonomously
scale and optimize their own database infrastructure.
"""

from __future__ import annotations

import json
import re
import subprocess
from datetime import UTC, datetime
from typing import Any

from bastion.config import DBA_SLOW_QUERY_LIMIT
from bastion.log_setup import get_logger

logger = get_logger(__name__)


class AutonomousDBA:
    """Self-tuning and auto-scaling agent operations operator.

    Uses ccloud CLI to manage cluster resources and MCP queries
    to inspect database performance metrics.
    """

    def __init__(
        self,
        cluster_id: str | None = None,
        threshold_ms: int = 150,
        auto_scale: bool = True,
    ):
        self.cluster_id = cluster_id
        self.threshold_ms = threshold_ms
        self.auto_scale = auto_scale
        self._last_scale_time: datetime | None = None
        self._scale_cooldown_seconds = 300

    def inspect_query_latency(self) -> dict[str, Any]:
        """Check for slow queries via crdb_internal tables."""
        if not self.cluster_id:
            return {"error": "No cluster_id configured", "slow_queries": []}

        # Security: Validate cluster_id to prevent argument injection
        if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$', self.cluster_id):
            return {"error": "Invalid cluster_id format", "slow_queries": []}

        try:
            # DBA_SLOW_QUERY_LIMIT is a validated integer constant from config
            limit = int(DBA_SLOW_QUERY_LIMIT)
            sql = (
                "SELECT key, count, max_total_time, max_service_latency "
                "FROM crdb_internal.node_statement_statistics "
                f"ORDER BY max_service_latency DESC LIMIT {limit}"
            )
            cmd = [
                "ccloud", "sql", "--cluster", self.cluster_id,
                "--execute", sql,
                "-o", "json",
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                data = json.loads(result.stdout)
                slow_queries = [
                    q for q in data
                    if q.get("max_service_latency", 0) > self.threshold_ms
                ]
                return {
                    "slow_count": len(slow_queries),
                    "threshold_ms": self.threshold_ms,
                    "queries": slow_queries[:5],
                }
            logger.warning("ccloud query latency check failed: %s", result.stderr)
            return {"error": "ccloud CLI error (see server logs)", "slow_queries": []}
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError) as e:
            logger.warning("Failed to inspect query latency: %s", e)
            return {"error": "ccloud operation failed", "slow_queries": []}

    def get_cluster_status(self) -> dict[str, Any]:
        """Get cluster status via ccloud CLI."""
        if not self.cluster_id:
            return {"error": "No cluster_id configured"}

        # Security: Validate cluster_id
        if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$', self.cluster_id):
            return {"error": "Invalid cluster_id format"}

        try:
            cmd = ["ccloud", "cluster", "describe", self.cluster_id, "-o", "json"]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                result_dict: dict[str, Any] = json.loads(result.stdout)
                return result_dict
            logger.warning("ccloud cluster status failed: %s", result.stderr)
            return {"error": "ccloud CLI error (see server logs)"}
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError) as e:
            logger.warning("Failed to get cluster status: %s", e)
            return {"error": "ccloud operation failed"}

    def scale_up_cluster(self, storage_gib: int | None = None, num_nodes: int | None = None) -> dict[str, Any]:
        """Trigger scale-up via ccloud CLI."""
        if not self.cluster_id:
            return {"error": "No cluster_id configured"}

        # Security: Validate cluster_id
        if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$', self.cluster_id):
            return {"error": "Invalid cluster_id format"}

        now = datetime.now(UTC)
        if self._last_scale_time:
            elapsed = (now - self._last_scale_time).total_seconds()
            if elapsed < self._scale_cooldown_seconds:
                return {
                    "error": "Scale cooldown active",
                    "retry_after_seconds": int(self._scale_cooldown_seconds - elapsed),
                }

        try:
            cmd = ["ccloud", "cluster", "update", self.cluster_id, "-o", "json"]
            if storage_gib:
                cmd.extend(["--storage-gib", str(storage_gib)])
            if num_nodes:
                cmd.extend(["--nodes", str(num_nodes)])

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if result.returncode == 0:
                self._last_scale_time = now
                return {
                    "status": "scaled",
                    "cluster_id": self.cluster_id,
                    "storage_gib": storage_gib,
                    "num_nodes": num_nodes,
                    "timestamp": now.isoformat(),
                }
            logger.warning("ccloud cluster update failed: %s", result.stderr)
            return {"error": "ccloud CLI error (see server logs)"}
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError) as e:
            logger.warning("Failed to scale cluster: %s", e)
            return {"error": "ccloud operation failed"}

    def health_check(self) -> dict[str, Any]:
        """Run a comprehensive health check."""
        status = self.get_cluster_status()
        latency = self.inspect_query_latency()

        return {
            "cluster_id": self.cluster_id,
            "timestamp": datetime.now(UTC).isoformat(),
            "cluster_status": status,
            "query_latency": latency,
            "recommendations": self._generate_recommendations(status, latency),
        }

    def _generate_recommendations(self, status: dict, latency: dict) -> list[str]:
        """Generate optimization recommendations."""
        recommendations = []

        if latency.get("slow_count", 0) > 5:
            recommendations.append(
                f"Found {latency['slow_count']} slow queries. Consider adding indexes or optimizing query patterns."
            )

        if latency.get("slow_count", 0) > 10 and self.auto_scale:
            recommendations.append(
                "High slow query count detected. Auto-scaling recommended."
            )

        if "error" in status:
            recommendations.append(
                f"Cluster status check failed: {status['error']}. Verify ccloud CLI configuration."
            )

        return recommendations


# ── Autonomous Schema Evolution ─────────────────────────────────────────────


# Allowed column types for semantic data contracts
ALLOWED_COLUMN_TYPES = frozenset({
    "TEXT", "STRING", "VARCHAR", "CHAR",
    "INT", "INTEGER", "INT8", "INT16", "INT32", "INT64",
    "FLOAT", "FLOAT4", "FLOAT8", "DECIMAL", "NUMERIC",
    "BOOL", "BOOLEAN",
    "JSONB", "JSON",
    "UUID",
    "TIMESTAMPTZ", "TIMESTAMP", "DATE", "TIME",
    "BYTES", "VARBYTES",
    "INET", "CIDR",
    "ARRAY",
})

# Patterns that are unsafe for DDL execution
_UNSAFE_DDL_PATTERNS = frozenset({
    "DROP TABLE", "DROP DATABASE", "TRUNCATE",
    "ALTER TABLE ... DROP COLUMN", "DELETE FROM",
    "GRANT", "REVOKE", "CREATE USER", "DROP USER",
})


class SchemaEvolution:
    """Autonomous schema evolution with semantic data contracts.

    Validates proposed schema changes against safety rules, then executes
    DDL mutations using CockroachDB's non-blocking online schema changes.

    This enables AI agents to adapt their memory schemas at runtime
    without manual migrations or service restarts.
    """

    def __init__(self, cluster_id: str | None = None):
        self.cluster_id = cluster_id

    def validate_proposal(
        self,
        table_name: str,
        column_name: str,
        column_type: str,
    ) -> dict[str, Any]:
        """Validate a schema change proposal against semantic data contracts.

        Returns validation result with allowed/rejected status and reason.
        """
        errors = []

        # Validate table name
        if not table_name or not isinstance(table_name, str):
            errors.append("table_name must be a non-empty string")
        elif not table_name.isidentifier():
            errors.append(f"Invalid table name: {table_name}")
        elif len(table_name) > 128:
            errors.append(f"table_name too long ({len(table_name)} > 128)")

        # Validate column name
        if not column_name or not isinstance(column_name, str):
            errors.append("column_name must be a non-empty string")
        elif not column_name.isidentifier():
            errors.append(f"Invalid column name: {column_name}")
        elif len(column_name) > 128:
            errors.append(f"column_name too long ({len(column_name)} > 128)")

        # Validate column type
        if not column_type or not isinstance(column_type, str):
            errors.append("column_type must be a non-empty string")
        elif column_type.upper() not in ALLOWED_COLUMN_TYPES:
            errors.append(
                f"Column type '{column_type}' not in allowed types. "
                f"Allowed: {', '.join(sorted(ALLOWED_COLUMN_TYPES))}"
            )

        # Check for unsafe DDL patterns
        proposed_ddl = f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"
        for pattern in _UNSAFE_DDL_PATTERNS:
            if pattern.lower() in proposed_ddl.lower():
                errors.append(f"Proposed DDL contains unsafe pattern: {pattern}")

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "table_name": table_name,
            "column_name": column_name,
            "column_type": column_type.upper() if column_type else None,
        }

    def execute_migration(
        self,
        table_name: str,
        column_name: str,
        column_type: str,
        default_value: str | None = None,
    ) -> dict[str, Any]:
        """Execute a validated schema migration using CockroachDB's online DDL.

        Uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS for idempotent execution.
        CockroachDB performs non-blocking schema changes that don't lock reads/writes.
        """
        # Validate first
        validation = self.validate_proposal(table_name, column_name, column_type)
        if not validation["valid"]:
            return {
                "status": "rejected",
                "errors": validation["errors"],
            }

        if not self.cluster_id:
            return {"error": "No cluster_id configured"}

        # Validate default_value to prevent SQL injection
        if default_value is not None:
            dv_err = self._validate_default_value(default_value)
            if dv_err:
                return {"status": "rejected", "errors": [dv_err]}

        # Build DDL
        col_type = column_type.upper()
        ddl = f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {column_name} {col_type}"
        if default_value:
            ddl += f" DEFAULT {default_value}"

        try:
            cmd = [
                "ccloud", "sql", "--cluster", self.cluster_id,
                "--execute", ddl,
                "-o", "json",
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

            if result.returncode == 0:
                return {
                    "status": "executed",
                    "ddl": ddl,
                    "table_name": table_name,
                    "column_name": column_name,
                    "column_type": col_type,
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            logger.warning("ccloud migration failed: %s", result.stderr)
            return {"status": "error", "error": "ccloud CLI error (see server logs)", "ddl": ddl}
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError) as e:
            logger.warning("Failed to execute migration: %s", e)
            return {"status": "error", "error": "ccloud operation failed", "ddl": ddl}

    def _validate_table_name(self, table_name: str) -> str | None:
        """Validate table name to prevent SQL injection. Returns None if valid, error message if invalid."""
        if not table_name or not isinstance(table_name, str):
            return "table_name must be a non-empty string"
        if not table_name.isidentifier():
            return f"Invalid table name: {table_name}"
        if len(table_name) > 128:
            return f"table_name too long ({len(table_name)} > 128)"
        return None

    _SAFE_DEFAULT_RE = re.compile(
        r"^(NULL|TRUE|FALSE|CURRENT_TIMESTAMP|CURRENT_DATE|NOW\(\)|GEN_RANDOM_UUID\(\)|\d+(\.\d+)?|'-?\d+(\.\d+)?'|'[^';]{0,255}')$",
        re.IGNORECASE,
    )

    def _validate_default_value(self, default_value: str) -> str | None:
        """Validate DEFAULT value to prevent SQL injection. Returns None if valid, error message if invalid."""
        if not default_value or not isinstance(default_value, str):
            return "default_value must be a non-empty string"
        if len(default_value) > 256:
            return f"default_value too long ({len(default_value)} > 256)"
        if not self._SAFE_DEFAULT_RE.match(default_value):
            return (
                "default_value contains unsafe characters. "
                "Only alphanumeric, quotes, parens, commas, and basic punctuation allowed."
            )
        return None

    def list_columns(self, table_name: str) -> dict[str, Any]:
        """List current columns for a table via SHOW COLUMNS."""
        if not self.cluster_id:
            return {"error": "No cluster_id configured"}

        err = self._validate_table_name(table_name)
        if err:
            return {"error": err}

        try:
            sql = f"SHOW COLUMNS FROM {table_name}"
            cmd = [
                "ccloud", "sql", "--cluster", self.cluster_id,
                "--execute", sql,
                "-o", "json",
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                columns = json.loads(result.stdout)
                return {
                    "table_name": table_name,
                    "columns": columns,
                    "column_count": len(columns),
                }
            logger.warning("ccloud list columns failed: %s", result.stderr)
            return {"error": "ccloud CLI error (see server logs)"}
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError) as e:
            logger.warning("Failed to list columns: %s", e)
            return {"error": "ccloud operation failed"}
