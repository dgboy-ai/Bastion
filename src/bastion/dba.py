"""Autonomous DBA Agent for CockroachDB.

Uses ccloud CLI to manage cluster operations and MCP queries
to inspect database performance. Enables agents to autonomously
scale and optimize their own database infrastructure.
"""

from __future__ import annotations

import json
import logging
import subprocess
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)


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

        try:
            sql = (
                "SELECT key, count, max_total_time, max_service_latency "
                "FROM crdb_internal.node_statement_statistics "
                "ORDER BY max_service_latency DESC LIMIT 10"
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
            return {"error": result.stderr, "slow_queries": []}
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError) as e:
            logger.warning("Failed to inspect query latency: %s", e)
            return {"error": str(e), "slow_queries": []}

    def get_cluster_status(self) -> dict[str, Any]:
        """Get cluster status via ccloud CLI."""
        if not self.cluster_id:
            return {"error": "No cluster_id configured"}

        try:
            cmd = ["ccloud", "cluster", "describe", self.cluster_id, "-o", "json"]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                return json.loads(result.stdout)
            return {"error": result.stderr}
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError) as e:
            logger.warning("Failed to get cluster status: %s", e)
            return {"error": str(e)}

    def scale_up_cluster(self, storage_gib: int | None = None, num_nodes: int | None = None) -> dict[str, Any]:
        """Trigger scale-up via ccloud CLI."""
        if not self.cluster_id:
            return {"error": "No cluster_id configured"}

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
            return {"error": result.stderr}
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError) as e:
            logger.warning("Failed to scale cluster: %s", e)
            return {"error": str(e)}

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
