from __future__ import annotations

import pytest

from bastion.locality import (
    _CRDB_REGION_ALIASES,
    REGION_COMPLIANCE,
    DataRegion,
    MemoryLocality,
    RegionConfig,
)
from bastion.memory import BastionMemory


@pytest.fixture
def memory():
    mem = BastionMemory("test-agent", mock=True)
    yield mem
    mem.close()


@pytest.fixture
def locality(memory):
    loc = MemoryLocality(memory)
    return loc


class TestMemoryLocality:
    def test_init_default_regions(self, locality):
        assert locality._routing_enabled is False
        assert len(locality._region_configs) == len(DataRegion)
        for region in DataRegion:
            assert region.value in locality._region_configs

    def test_enable_regional_routing_mock(self, locality):
        result = locality.enable_regional_routing()
        assert result["status"] == "enabled"
        assert result["mode"] == "mock"
        assert locality._routing_enabled is True
        assert "us-east-1" in result["regions"]
        assert "eu-west-1" in result["regions"]

    def test_disable_regional_routing(self, locality):
        locality.enable_regional_routing()
        result = locality.disable_regional_routing()
        assert result["status"] == "disabled"
        assert locality._routing_enabled is False

    def test_set_agent_region_valid(self, locality):
        result = locality.set_agent_region("agent-1", "eu-west-1")
        assert result["status"] == "set"
        assert result["agent_id"] == "agent-1"
        assert result["region"] == "eu-west-1"
        assert "GDPR" in result["compliance_frameworks"]
        assert locality._agent_regions["agent-1"] == "eu-west-1"

    def test_set_agent_region_invalid(self, locality):
        result = locality.set_agent_region("agent-1", "mars-north-1")
        assert "error" in result
        assert "mars-north-1" in result["error"]
        assert "agent-1" not in locality._agent_regions

    def test_get_agent_region(self, locality):
        locality.set_agent_region("agent-1", "ap-south-1")
        region = locality.get_agent_region("agent-1")
        assert region == "ap-south-1"

    def test_get_agent_region_unset(self, locality):
        region = locality.get_agent_region("ghost-agent")
        assert region is None

    def test_get_region_compliance(self, locality):
        frameworks = locality.get_region_compliance("eu-west-1")
        assert "GDPR" in frameworks
        assert "SOC2" in frameworks

    def test_get_region_compliance_unknown(self, locality):
        frameworks = locality.get_region_compliance("mars-north-1")
        assert frameworks == []

    def test_validate_compliance_pass(self, locality):
        locality.set_agent_region("agent-1", "eu-west-1")
        result = locality.validate_compliance("agent-1", "GDPR")
        assert result["compliant"] is True
        assert result["region"] == "eu-west-1"

    def test_validate_compliance_fail(self, locality):
        locality.set_agent_region("agent-1", "us-east-1")
        result = locality.validate_compliance("agent-1", "GDPR")
        assert result["compliant"] is False

    def test_validate_compliance_no_region(self, locality):
        result = locality.validate_compliance("ghost-agent", "GDPR")
        assert result["compliant"] is False
        assert "No region set" in result.get("error", "")

    def test_get_routing_stats_empty(self, locality):
        stats = locality.get_routing_stats()
        assert stats["routing_enabled"] is False
        assert stats["total_agents"] == 0
        assert stats["total_regions"] == 6

    def test_get_routing_stats_with_agents(self, locality):
        locality.enable_regional_routing()
        locality.set_agent_region("agent-1", "eu-west-1")
        locality.set_agent_region("agent-2", "us-east-1")
        locality.set_agent_region("agent-3", "eu-west-1")
        stats = locality.get_routing_stats()
        assert stats["routing_enabled"] is True
        assert stats["total_agents"] == 3
        assert stats["agents_by_region"]["eu-west-1"] == 2
        assert stats["agents_by_region"]["us-east-1"] == 1

    def test_store_memory_without_routing(self, locality):
        result = locality.store_memory("agent-1", "test", "content")
        assert result["status"] == "error"
        assert "routing not enabled" in result["error"].lower()

    def test_store_memory_without_region(self, locality):
        locality.enable_regional_routing()
        result = locality.store_memory("agent-1", "test", "content")
        assert result["status"] == "error"
        assert "No region set" in result["error"]

    def test_store_memory_success(self, locality):
        locality.enable_regional_routing()
        locality.set_agent_region("agent-1", "eu-west-1")
        result = locality.store_memory("agent-1", "test", "hello world")
        assert result["status"] == "stored"
        assert result["region"] == "eu-west-1"
        assert "memory_id" in result

    def test_store_memory_with_force_region(self, locality):
        locality.enable_regional_routing()
        locality.set_agent_region("agent-1", "eu-west-1")
        result = locality.store_memory(
            "agent-1", "test", "content", force_region="ap-south-1"
        )
        assert result["status"] == "stored"
        assert result["region"] == "ap-south-1"

    def test_store_memory_persists_metadata_region(self, locality, memory):
        locality.enable_regional_routing()
        locality.set_agent_region("agent-1", "eu-west-1")
        result = locality.store_memory("agent-1", "test", "data", metadata={"key": "val"})
        assert result["status"] == "stored"
        records = memory.list_all()
        assert len(records) == 1
        assert records[0].metadata.get("_region") == "eu-west-1"
        assert records[0].metadata.get("key") == "val"

    def test_search_memory_without_routing(self, locality):
        result = locality.search_memory("agent-1", "query")
        assert result["status"] == "error"
        assert "routing not enabled" in result["error"].lower()

    def test_search_memory_without_region(self, locality):
        locality.enable_regional_routing()
        result = locality.search_memory("ghost-agent", "query")
        assert result["status"] == "error"
        assert "region set" in result["error"]

    def test_search_memory_success(self, locality):
        locality.enable_regional_routing()
        locality.set_agent_region("agent-1", "eu-west-1")
        locality.store_memory("agent-1", "test", "hello world")
        result = locality.search_memory("agent-1", "hello")
        assert result["status"] == "ok"
        assert result["region"] == "eu-west-1"
        assert result["count"] >= 1

    def test_search_memory_region_isolation_mock(self, locality):
        """Verify that search doesn't return records from other regions."""
        locality.enable_regional_routing()
        locality.set_agent_region("agent-1", "eu-west-1")
        locality.store_memory("agent-1", "test", "eu data")
        locality.set_agent_region("agent-2", "us-east-1")
        locality.store_memory("agent-2", "test", "us data")
        result = locality.search_memory("agent-1", "data")
        assert result["status"] == "ok"
        assert result["region"] == "eu-west-1"

    def test_verify_row_region_mock(self, locality):
        locality.enable_regional_routing()
        result = locality.verify_row_region("some-id")
        assert result["verified"] is True
        assert result["mode"] == "mock"

    def test_verify_compliance_mock(self, locality):
        locality.enable_regional_routing()
        locality.set_agent_region("agent-1", "eu-west-1")
        result = locality.verify_compliance("agent-1")
        assert result["compliant"] is True
        assert result["mode"] == "mock"
        assert "GDPR" in result["frameworks"]

    def test_verify_compliance_no_region(self, locality):
        result = locality.verify_compliance("ghost-agent")
        assert result["compliant"] is False

    def test_region_config_dataclass(self):
        cfg = RegionConfig(
            region=DataRegion.EU_WEST_1,
            compliance_frameworks=["GDPR", "SOC2"],
        )
        assert cfg.region == DataRegion.EU_WEST_1
        assert cfg.max_latency_ms == 100
        assert cfg.enabled is True

    def test_region_compliance_all_regions(self):
        assert len(REGION_COMPLIANCE) == 6
        assert "GDPR" in REGION_COMPLIANCE["eu-west-1"]
        assert "GDPR" in REGION_COMPLIANCE["eu-central-1"]
        assert "HIPAA" in REGION_COMPLIANCE["us-east-1"]
        assert "SOC2" in REGION_COMPLIANCE["us-east-1"]
        assert "SOC2" in REGION_COMPLIANCE["ap-south-1"]
        assert "PDPA" in REGION_COMPLIANCE["ap-southeast-1"]

    def test_crdb_region_aliases(self):
        assert _CRDB_REGION_ALIASES["us-east-1"] == "aws-us-east-1"
        assert _CRDB_REGION_ALIASES["eu-west-1"] == "aws-eu-west-1"

    def test_data_region_enum(self):
        assert DataRegion.US_EAST_1.value == "us-east-1"
        assert DataRegion.EU_WEST_1.value == "eu-west-1"
        assert DataRegion.AP_SOUTH_1.value == "ap-south-1"

    def test_double_enable_idempotent(self, locality):
        r1 = locality.enable_regional_routing()
        r2 = locality.enable_regional_routing()
        assert r1["status"] == "enabled"
        assert r2["status"] == "enabled"

    def test_re_set_agent_region(self, locality):
        locality.set_agent_region("agent-1", "eu-west-1")
        result = locality.set_agent_region("agent-1", "us-east-1")
        assert result["status"] == "set"
        assert result["region"] == "us-east-1"
        assert locality.get_agent_region("agent-1") == "us-east-1"

    def test_get_routing_stats_after_disable(self, locality):
        locality.enable_regional_routing()
        locality.set_agent_region("agent-1", "eu-west-1")
        locality.disable_regional_routing()
        stats = locality.get_routing_stats()
        assert stats["routing_enabled"] is False
        assert stats["total_agents"] == 1

    def test_memory_with_region_param(self, memory):
        """Verify memory.store(region=...) passes region to mock layer."""
        rec = memory.store("test", "content", region="eu-west-1")
        assert rec.memory_id is not None
        assert rec.content == "content"

    def test_memory_search_with_region_filter(self, memory):
        memory.store("test", "eu content", region="eu-west-1")
        memory.store("test", "us content", region="us-east-1")
        eu_results = memory.search("content", region_filter="eu-west-1")
        us_results = memory.search("content", region_filter="us-east-1")
        all_results = memory.search("content")
        assert len(eu_results) >= 1
        assert len(us_results) >= 1
        assert len(all_results) >= 2

    def test_memory_store_rejects_empty_region(self, memory):
        with pytest.raises(ValueError, match="non-empty string"):
            memory.store("test", "content", region="")

    def test_memory_search_rejects_empty_region_filter(self, memory):
        with pytest.raises(ValueError, match="non-empty string"):
            memory.search("query", region_filter="")

    def test_verify_row_region_without_routing(self, locality):
        result = locality.verify_row_region("some-id")
        assert result["verified"] is False
        assert "routing not enabled" in result.get("error", "").lower()

    def test_verify_compliance_without_routing(self, locality):
        result = locality.verify_compliance("agent-1")
        assert result["compliant"] is False
        assert "routing not enabled" in result.get("error", "").lower()

    def test_memory_list_all_with_region_filter(self, memory):
        memory.store("test", "eu data", region="eu-west-1")
        memory.store("test", "us data", region="us-east-1")
        eu_results = memory.list_all(region_filter="eu-west-1")
        us_results = memory.list_all(region_filter="us-east-1")
        all_results = memory.list_all()
        assert len(eu_results) >= 1
        assert len(us_results) >= 1
        assert len(all_results) >= 2
