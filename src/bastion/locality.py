from __future__ import annotations

import threading
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from bastion.config import LOCALITY_LIMIT
from bastion.log_setup import get_logger

logger = get_logger(__name__)


class DataRegion(StrEnum):
    """Supported geographic regions for data residency."""

    US_EAST_1 = "us-east-1"
    US_WEST_2 = "us-west-2"
    EU_WEST_1 = "eu-west-1"
    EU_CENTRAL_1 = "eu-central-1"
    AP_SOUTH_1 = "ap-south-1"
    AP_SOUTHEAST_1 = "ap-southeast-1"


REGION_COMPLIANCE: dict[str, list[str]] = {
    "us-east-1": ["SOC2", "HIPAA"],
    "us-west-2": ["SOC2", "HIPAA"],
    "eu-west-1": ["GDPR", "SOC2"],
    "eu-central-1": ["GDPR", "SOC2"],
    "ap-south-1": ["SOC2"],
    "ap-southeast-1": ["SOC2", "PDPA"],
}

_CRDB_REGION_ALIASES: dict[str, str] = {
    "us-east-1": "aws-us-east-1",
    "us-west-2": "aws-us-west-2",
    "eu-west-1": "aws-eu-west-1",
    "eu-central-1": "aws-eu-central-1",
    "ap-south-1": "aws-ap-south-1",
    "ap-southeast-1": "aws-ap-southeast-1",
}


@dataclass
class RegionConfig:
    """Configuration for a specific data region including compliance frameworks."""

    region: DataRegion
    compliance_frameworks: list[str]
    max_latency_ms: int = 100
    enabled: bool = True


class MemoryLocality:
    """Multi-Region Row-Level Locality for GDPR data residency.

    Routes memory rows to regional serverless zones via CockroachDB
    REGIONAL BY ROW. Each row carries a ``crdb_region`` column that CRDB
    uses for automatic geo-partitioning. Queries filter by region for
    data-residency compliance.

    Usage::

        loc = MemoryLocality(memory)
        loc.enable_regional_routing()
        loc.set_agent_region("agent-1", "eu-west-1")
        loc.store_memory("agent-1", "thought", content)
        results = loc.search_memory("agent-1", query)
        report  = loc.verify_compliance("agent-1")

    Works in both mock and real CRDB mode transparently.
    """

    def __init__(self, memory: Any):
        self._memory = memory
        self._routing_enabled = False
        self._agent_regions: dict[str, str] = {}
        self._region_configs: dict[str, RegionConfig] = {}
        self._lock = threading.Lock()
        self._init_default_regions()

    # ── Public API ──────────────────────────────────────────────────────────

    def enable_regional_routing(self) -> dict[str, Any]:
        """Enable REGIONAL BY ROW on the ``agent_memory`` table.

        In real CRDB mode this executes the schema migration (ALTER TABLE).
        In mock mode it is a no-op that returns the available regions.
        """
        with self._lock:
            self._routing_enabled = True
            if self._memory._mock:
                return {
                    "status": "enabled",
                    "regions": list(self._region_configs.keys()),
                    "total_regions": len(self._region_configs),
                    "mode": "mock",
                }
            try:
                pool = self._memory.get_pool()
                conn = pool.acquire(timeout=30.0)
                try:
                    with conn.cursor() as cur:
                        cur.execute(
                            "ALTER TABLE agent_memory "
                            "ADD COLUMN IF NOT EXISTS crdb_region STRING "
                            "NOT NULL DEFAULT 'us-east-1'"
                        )
                        cur.execute("ALTER TABLE agent_memory SET LOCALITY REGIONAL BY ROW AS crdb_region")
                        cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_region ON agent_memory (crdb_region)")
                        cur.execute(
                            "CREATE TABLE IF NOT EXISTS agent_region_mapping ("
                            "agent_id   STRING PRIMARY KEY, "
                            "region     STRING NOT NULL, "
                            "updated_at TIMESTAMPTZ DEFAULT now())"
                        )
                    conn.commit()
                    return {
                        "status": "enabled",
                        "regions": list(self._region_configs.keys()),
                        "total_regions": len(self._region_configs),
                        "mode": "crdb",
                    }
                except Exception:
                    conn.rollback()
                    logger.exception("Failed to enable regional routing")
                    return {"status": "error", "error": "Operation failed — check server logs"}
                finally:
                    pool.release(conn)
            except Exception as exc:
                logger.exception("Pool error in enable_regional_routing")
                return {"status": "error", "error": f"Pool error: {exc}"}

    def disable_regional_routing(self) -> dict[str, Any]:
        with self._lock:
            self._routing_enabled = False
            return {"status": "disabled"}

    def set_agent_region(self, agent_id: str, region: str) -> dict[str, Any]:
        """Persist an agent's data-residency region.

        In real mode the mapping is written to ``agent_region_mapping``.
        In mock mode it is held in-memory.
        """
        with self._lock:
            if region not in self._region_configs:
                return {
                    "error": f"Unknown region: {region}. Available: {list(self._region_configs.keys())}",
                }
            self._agent_regions[agent_id] = region
            if not self._memory._mock:
                try:
                    pool = self._memory.get_pool()
                    conn = pool.acquire(timeout=30.0)
                    try:
                        with conn.cursor() as cur:
                            cur.execute(
                                "UPSERT INTO agent_region_mapping "
                                "(agent_id, region, updated_at) "
                                "VALUES (%s, %s, now())",
                                (agent_id, region),
                            )
                        conn.commit()
                    except Exception:
                        conn.rollback()
                        logger.exception(
                            "Failed to persist agent region",
                            extra={"agent_id": agent_id, "region": region},
                        )
                        return {"status": "error", "error": "Operation failed — check server logs"}
                    finally:
                        pool.release(conn)
                except Exception as exc:
                    logger.exception("Pool error in set_agent_region")
                    return {"status": "error", "error": f"Pool error: {exc}"}
            return {
                "status": "set",
                "agent_id": agent_id,
                "region": region,
                "compliance_frameworks": self._region_configs[region].compliance_frameworks,
            }

    def get_agent_region(self, agent_id: str) -> str | None:
        with self._lock:
            cached = self._agent_regions.get(agent_id)
            if cached is not None:
                return cached
        if self._memory._mock:
            return None
        try:
            pool = self._memory.get_pool()
            conn = pool.acquire(timeout=10.0)
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT region FROM agent_region_mapping WHERE agent_id = %s",
                        (agent_id,),
                    )
                    row = cur.fetchone()
                    if row:
                        region = str(row[0])
                        self._agent_regions[agent_id] = region
                        return region
                    return None
            finally:
                pool.release(conn)
        except Exception as exc:
            logger.warning(
                "Failed to fetch agent region from DB",
                extra={"agent_id": agent_id, "error": str(exc)},
            )
            return None

    def get_region_compliance(self, region: str) -> list[str]:
        config = self._region_configs.get(region)
        return config.compliance_frameworks if config else []

    def validate_compliance(self, agent_id: str, required_framework: str) -> dict[str, Any]:
        region = self.get_agent_region(agent_id)
        if not region:
            return {
                "compliant": False,
                "error": f"No region set for agent {agent_id}",
                "agent_id": agent_id,
            }
        frameworks = self.get_region_compliance(region)
        compliant = required_framework in frameworks
        return {
            "compliant": compliant,
            "agent_id": agent_id,
            "region": region,
            "required_framework": required_framework,
            "available_frameworks": frameworks,
        }

    def get_routing_stats(self) -> dict[str, Any]:
        with self._lock:
            region_counts: dict[str, int] = {}
            for region in self._agent_regions.values():
                region_counts[region] = region_counts.get(region, 0) + 1
            return {
                "routing_enabled": self._routing_enabled,
                "total_agents": len(self._agent_regions),
                "agents_by_region": region_counts,
                "total_regions": len(self._region_configs),
            }

    # ── Store / Search integration ─────────────────────────────────────────

    def store_memory(
        self,
        agent_id: str,
        memory_type: str,
        content: str,
        metadata: dict[str, Any] | None = None,
        expires_in_seconds: int | None = None,
        force_region: str | None = None,
    ) -> dict[str, Any]:
        if not self._routing_enabled:
            return {
                "status": "error",
                "error": "Regional routing not enabled. Call enable_regional_routing() first.",
            }
        region = force_region or self.get_agent_region(agent_id)
        if not region:
            return {
                "status": "error",
                "error": f"No region set for agent {agent_id}",
            }
        meta = dict(metadata) if metadata else {}
        meta["_region"] = region
        try:
            record = self._memory.store(
                memory_type=memory_type,
                content=content,
                metadata=meta,
                expires_in_seconds=expires_in_seconds,
                region=region,
            )
            return {
                "status": "stored",
                "memory_id": record.memory_id,
                "region": region,
                "agent_id": agent_id,
            }
        except Exception:
            logger.exception("Region-aware store failed")
            return {"status": "error", "error": "Region-aware store failed — check server logs"}

    def search_memory(
        self,
        agent_id: str,
        query: str,
        k: int = 5,
        memory_type: str | None = None,
    ) -> dict[str, Any]:
        if not self._routing_enabled:
            return {
                "status": "error",
                "error": "Regional routing not enabled.",
            }
        region = self.get_agent_region(agent_id)
        if not region:
            return {
                "status": "error",
                "error": f"No region set for agent {agent_id}",
            }
        try:
            results = self._memory.search(
                query=query,
                k=k,
                memory_type=memory_type,
                region_filter=region,
            )
            return {
                "status": "ok",
                "count": len(results),
                "region": region,
                "agent_id": agent_id,
            }
        except Exception:
            logger.exception("Region-aware search failed")
            return {"status": "error", "error": "Region-aware search failed — check server logs"}

    def verify_row_region(self, memory_id: str) -> dict[str, Any]:
        """Verify which region a specific row resides in by querying CRDB."""
        if not self._routing_enabled:
            return {"memory_id": memory_id, "error": "Regional routing not enabled", "verified": False}
        if self._memory._mock:
            return {
                "memory_id": memory_id,
                "region": "simulated",
                "verified": True,
                "mode": "mock",
            }
        try:
            pool = self._memory.get_pool()
            conn = pool.acquire(timeout=10.0)
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT crdb_region, agent_id, memory_type, "
                        "SUBSTRING(content, 1, 100) AS content_preview "
                        "FROM agent_memory WHERE memory_id = %s",
                        (memory_id,),
                    )
                    row = cur.fetchone()
                if row:
                    return {
                        "memory_id": memory_id,
                        "region": str(row[0]),
                        "agent_id": str(row[1]),
                        "memory_type": str(row[2]),
                        "content_preview": str(row[3]),
                        "verified": True,
                    }
                return {
                    "memory_id": memory_id,
                    "error": "not_found",
                    "verified": False,
                }
            finally:
                pool.release(conn)
        except Exception:
            logger.exception("Row region verification failed")
            return {"memory_id": memory_id, "error": "Verification failed — check server logs", "verified": False}

    def verify_compliance(self, agent_id: str) -> dict[str, Any]:
        """End-to-end compliance check: fetch region from DB, verify rows."""
        if not self._routing_enabled:
            return {"compliant": False, "error": "Regional routing not enabled", "agent_id": agent_id}
        region = self.get_agent_region(agent_id)
        if not region:
            return {
                "compliant": False,
                "error": f"No region set for agent {agent_id}",
                "agent_id": agent_id,
            }
        if self._memory._mock:
            frameworks = self.get_region_compliance(region)
            return {
                "compliant": True,
                "agent_id": agent_id,
                "region": region,
                "frameworks": frameworks,
                "mode": "mock",
            }
        try:
            pool = self._memory.get_pool()
            conn = pool.acquire(timeout=10.0)
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT DISTINCT crdb_region FROM agent_memory WHERE agent_id = %s LIMIT %s",
                        (agent_id, LOCALITY_LIMIT),
                    )
                    actual_regions = {str(r[0]) for r in cur.fetchall()}
                expected_alias = _CRDB_REGION_ALIASES.get(region, region)
                if not actual_regions:
                    return {
                        "compliant": True,
                        "agent_id": agent_id,
                        "region": region,
                        "note": "No rows found for agent (trivially compliant)",
                    }
                non_compliant = actual_regions - {expected_alias, "us-east-1", region}
                if non_compliant:
                    return {
                        "compliant": False,
                        "agent_id": agent_id,
                        "region": region,
                        "expected_region": expected_alias,
                        "non_compliant_regions": list(non_compliant),
                    }
                return {
                    "compliant": True,
                    "agent_id": agent_id,
                    "region": region,
                    "actual_regions": list(actual_regions),
                }
            finally:
                pool.release(conn)
        except Exception:
            logger.exception("Compliance verification failed")
            return {"compliant": False, "error": "Compliance check failed — check server logs"}

    # ── Internal helpers ────────────────────────────────────────────────────

    def _init_default_regions(self) -> None:
        for region in DataRegion:
            frameworks = REGION_COMPLIANCE.get(region.value, ["SOC2"])
            self._region_configs[region.value] = RegionConfig(
                region=region,
                compliance_frameworks=frameworks,
            )
