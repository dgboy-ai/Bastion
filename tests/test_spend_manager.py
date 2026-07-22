from __future__ import annotations

from bastion.spend_manager import SpendManager


def test_spend_manager_mock():
    sm = SpendManager(mock=True)
    result = sm.check_and_increment("agent-1", "search", 1)
    assert result["allowed"] is True
    assert result["remaining"] == 999999

    usage = sm.get_usage("agent-1")
    assert "search" in usage
    assert usage["search"]["remaining"] >= 10000


def test_spend_manager_budget_reset():
    sm = SpendManager(mock=True)
    assert sm.reset_budget("agent-1") is True
