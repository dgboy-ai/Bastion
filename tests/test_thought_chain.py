from __future__ import annotations

import json

import pytest

from bastion.memory import BastionMemory
from bastion.thought_chain import (
    GraphCycleError,
    ThoughtChain,
    ThoughtNode,
    ThoughtStatus,
    ThoughtType,
)


@pytest.fixture
def memory():
    mem = BastionMemory("test-agent", mock=True)
    yield mem
    mem.close()


@pytest.fixture
def chain(memory):
    return ThoughtChain(memory, agent_id="test-agent")


class TestThoughtChain:
    def test_begin_creates_root(self, chain):
        root = chain.begin("Analyze the problem")
        assert root is not None
        graph = chain.get_graph(root)
        assert graph["total_nodes"] == 1
        assert graph["nodes"][0]["thought_type"] == "begin"

    def test_think_adds_child(self, chain):
        root = chain.begin("Analyze")
        t1 = chain.think("Hypothesis 1", parent_id=root)
        graph = chain.get_graph(root)
        assert graph["total_nodes"] == 2
        assert graph["total_edges"] == 1
        assert graph["edges"][0]["source"] == root
        assert graph["edges"][0]["target"] == t1

    def test_full_chain(self, chain):
        root = chain.begin("Start")
        t1 = chain.think("Think step", parent_id=root)
        d1 = chain.decide("Decision", parent_id=t1)
        chain.reject("Rejected alt", parent_id=d1)
        chain.complete("Done", parent_id=d1)
        graph = chain.get_graph(root)
        assert graph["total_nodes"] == 5
        assert graph["total_edges"] == 4

    def test_decide(self, chain):
        root = chain.begin("Start")
        d = chain.decide("Make choice", parent_id=root)
        graph = chain.get_graph(root)
        assert graph["nodes"][1]["thought_type"] == "decision"
        assert graph["nodes"][1]["thought_id"] == d

    def test_reject(self, chain):
        root = chain.begin("Start")
        r = chain.reject("Bad idea", parent_id=root)
        graph = chain.get_graph(root)
        assert graph["nodes"][1]["thought_type"] == "rejection"
        assert graph["nodes"][1]["thought_id"] == r

    def test_observe(self, chain):
        root = chain.begin("Start")
        o = chain.observe("Noticed something", parent_id=root)
        graph = chain.get_graph(root)
        assert graph["nodes"][1]["thought_type"] == "observation"
        assert graph["nodes"][1]["thought_id"] == o

    def test_question(self, chain):
        root = chain.begin("Start")
        q = chain.question("What if?", parent_id=root)
        graph = chain.get_graph(root)
        assert graph["nodes"][1]["thought_type"] == "question"
        assert graph["nodes"][1]["thought_id"] == q

    def test_action(self, chain):
        root = chain.begin("Start")
        a = chain.action("Execute step", parent_id=root)
        graph = chain.get_graph(root)
        assert graph["nodes"][1]["thought_type"] == "action"
        assert graph["nodes"][1]["thought_id"] == a

    def test_result(self, chain):
        root = chain.begin("Start")
        res = chain.result("Got output", parent_id=root)
        graph = chain.get_graph(root)
        assert graph["nodes"][1]["thought_type"] == "result"
        assert graph["nodes"][1]["thought_id"] == res

    def test_complete(self, chain):
        root = chain.begin("Start")
        c = chain.complete("Finished", parent_id=root)
        graph = chain.get_graph(root)
        assert graph["nodes"][1]["thought_type"] == "complete"
        assert graph["nodes"][1]["thought_id"] == c

    def test_get_graph_no_root(self, chain):
        graph = chain.get_graph(None)
        assert graph["total_nodes"] == 0
        assert graph["root"] is None

    def test_get_graph_unknown_root(self, chain):
        graph = chain.get_graph("nonexistent")
        assert graph.get("total_nodes", 0) == 0
        assert "error" in graph

    def test_get_graph_max_depth(self, chain):
        root = chain.begin("Root")
        prev = root
        for i in range(10):
            prev = chain.think(f"Step {i}", parent_id=prev)
        graph = chain.get_graph(root, max_depth=3)
        assert graph["total_nodes"] <= 4
        assert graph["total_nodes"] >= 1

    def test_get_graph_without_root_falls_back_to_current(self, chain):
        root = chain.begin("Start")
        chain.think("Step 1", parent_id=root)
        graph = chain.get_graph()
        assert graph["total_nodes"] == 2

    def test_get_graph_without_any_root(self, chain):
        graph = chain.get_graph()
        assert graph["total_nodes"] == 0

    def test_get_path_to_root(self, chain):
        root = chain.begin("Root")
        t1 = chain.think("Level 1", parent_id=root)
        t2 = chain.think("Level 2", parent_id=t1)
        t3 = chain.think("Level 3", parent_id=t2)
        path = chain.get_path_to_root(t3)
        assert len(path) == 4
        assert path[0]["thought_type"] == "begin"
        assert path[-1]["thought_type"] == "hypothesis"
        assert path[-1]["thought_id"] == t3

    def test_get_path_to_root_unknown(self, chain):
        path = chain.get_path_to_root("ghost")
        assert path == []

    def test_get_downstream(self, chain):
        root = chain.begin("Root")
        t1 = chain.think("Mid", parent_id=root)
        chain.decide("Leaf A", parent_id=t1)
        chain.decide("Leaf B", parent_id=t1)
        result = chain.get_downstream(t1)
        assert result["total_descendants"] == 2
        assert result["source"] == t1

    def test_get_downstream_unknown(self, chain):
        result = chain.get_downstream("ghost")
        assert "error" in result

    def test_get_downstream_no_children(self, chain):
        root = chain.begin("Root")
        result = chain.get_downstream(root)
        assert result["total_descendants"] == 0

    def test_detect_cycles_no_cycle(self, chain):
        root = chain.begin("Root")
        chain.think("Step 1", parent_id=root)
        chain.decide("Step 2", parent_id=root)
        result = chain.detect_cycles(root)
        assert result["has_cycle"] is False

    def test_detect_cycles_empty(self, chain):
        result = chain.detect_cycles(None)
        assert result["has_cycle"] is False

    def test_cycle_raises_on_traversal(self, chain, memory):
        root = chain.begin("Root")
        step1 = chain.think("Step 1", parent_id=root)
        step2 = chain.think("Step 2", parent_id=step1)
        # Create cycle: set Step 1's parent to Step 2 → root→Step1→Step2→Step1→...
        from bastion import mock as _mock
        agent_data = _mock._agent_data.get("test-agent", [])
        for rec in agent_data:
            try:
                content = json.loads(rec["content"])
                if content.get("thought_id") == step1:
                    content["parent_id"] = step2
                    rec["content"] = json.dumps(content)
                    break
            except (json.JSONDecodeError, KeyError):
                continue
        with pytest.raises(GraphCycleError):
            chain.get_graph(step1)

    def test_cycle_detected_by_detect_cycles(self, chain):
        root = chain.begin("Root")
        step1 = chain.think("Step 1", parent_id=root)
        step2 = chain.think("Step 2", parent_id=step1)
        # Create cycle: set Step 1's parent to Step 2
        from bastion import mock as _mock
        agent_data = _mock._agent_data.get("test-agent", [])
        for rec in agent_data:
            try:
                content = json.loads(rec["content"])
                if content.get("thought_id") == step1:
                    content["parent_id"] = step2
                    rec["content"] = json.dumps(content)
                    break
            except (json.JSONDecodeError, KeyError):
                continue
        result = chain.detect_cycles(root)
        assert result["has_cycle"] is True

    # ── Pattern extraction ─────────────────────────────────────────────────

    def test_extract_patterns_empty(self, chain):
        patterns = chain.extract_patterns()
        assert patterns["patterns"] == []

    def test_extract_patterns_backtrack(self, chain):
        root = chain.begin("Start")
        d1 = chain.decide("Option A", parent_id=root)
        r1 = chain.reject("Option A rejected", parent_id=d1)
        chain.decide("Option B", parent_id=r1)
        result = chain.extract_patterns(root)
        backtracks = [p for p in result["patterns"] if p["type"] == "backtrack"]
        assert len(backtracks) >= 1

    def test_extract_patterns_abandoned(self, chain):
        root = chain.begin("Start")
        chain.reject("Bad idea", parent_id=root)
        result = chain.extract_patterns(root)
        abandoned = [p for p in result["patterns"] if p["type"] == "abandoned_branch"]
        assert len(abandoned) >= 1

    def test_extract_patterns_decision_efficiency(self, chain):
        root = chain.begin("Start")
        chain.decide("D1", parent_id=root)
        chain.decide("D2", parent_id=root)
        result = chain.extract_patterns(root)
        eff = [p for p in result["patterns"] if p["type"] == "decision_efficiency"]
        assert len(eff) >= 1
        assert eff[0]["decision_ratio"] > 0

    def test_extract_patterns_questions(self, chain):
        root = chain.begin("Start")
        chain.question("Why?", parent_id=root)
        chain.question("How?", parent_id=root)
        result = chain.extract_patterns(root)
        qf = [p for p in result["patterns"] if p["type"] == "question_frequency"]
        assert len(qf) >= 1
        assert qf[0]["count"] == 2

    # ── Summary ────────────────────────────────────────────────────────────

    def test_get_summary(self, chain):
        root = chain.begin("Start")
        chain.think("Step", parent_id=root)
        chain.decide("Choice", parent_id=root)
        summary = chain.get_summary(root)
        assert summary["total_nodes"] == 3
        assert summary["decisions"] == 1
        assert "hypothesis" in summary["by_type"]
        assert "decision" in summary["by_type"]

    def test_get_summary_empty(self, chain):
        summary = chain.get_summary(None)
        assert summary["total_nodes"] == 0

    # ── Cross-session ──────────────────────────────────────────────────────

    def test_list_sessions(self, chain):
        chain.begin("First session")
        chain.begin("Second session")
        sessions = chain.list_sessions()
        assert len(sessions) >= 1

    def test_get_session_found(self, chain):
        root = chain.begin("Session 1")
        chain.think("Data", parent_id=root)
        session_id = chain._current_session
        assert session_id is not None
        graph = chain.get_session(session_id)
        assert graph["total_nodes"] >= 1

    def test_get_session_not_found(self, chain):
        graph = chain.get_session("ghost-session")
        assert "error" in graph

    def test_session_id_on_node(self, chain):
        root = chain.begin("Session")
        node_id = chain.think("Thought", parent_id=root)
        all_nodes = chain._load_nodes()
        node = next((n for n in all_nodes if n.thought_id == node_id), None)
        assert node is not None
        assert node.session_id == chain._current_session

    # ── Edge cases ─────────────────────────────────────────────────────────

    def test_confidence_values(self, chain):
        root = chain.begin("Root")
        t1 = chain.think("Low confidence", parent_id=root, confidence=0.3)
        t2 = chain.think("High confidence", parent_id=root, confidence=0.9)
        graph = chain.get_graph(root)
        nodes = {n["thought_id"]: n for n in graph["nodes"]}
        assert nodes[t1]["confidence"] == 0.3
        assert nodes[t2]["confidence"] == 0.9

    def test_metadata_preserved(self, chain):
        root = chain.begin("Root", metadata={"source": "user", "priority": 1})
        node = chain._load_nodes()
        root_node = next(n for n in node if n.thought_id == root)
        assert root_node.metadata["source"] == "user"
        assert root_node.metadata["priority"] == 1

    def test_think_without_parent_uses_current_root(self, chain):
        root = chain.begin("Root")
        t1 = chain.think("Auto-parent")
        graph = chain.get_graph(root)
        assert graph["total_nodes"] == 2
        assert graph["edges"][0]["source"] == root
        assert graph["edges"][0]["target"] == t1

    def test_chain_not_mutated_across_calls(self, chain):
        root = chain.begin("Root")
        chain.think("Step 1", parent_id=root)
        g1 = chain.get_graph(root)
        chain.think("Step 2", parent_id=root)
        g2 = chain.get_graph(root)
        assert g2["total_nodes"] == g1["total_nodes"] + 1

    def test_get_path_to_root_raises_on_cycle(self, chain):
        root = chain.begin("Root")
        child = chain.think("Step", parent_id=root)
        from bastion import mock as _mock
        agent_data = _mock._agent_data.get("test-agent", [])
        # Set root's parent to child — creates cycle root → child → root
        for rec in agent_data:
            try:
                content = json.loads(rec["content"])
                if content.get("thought_id") == root:
                    content["parent_id"] = child
                    rec["content"] = json.dumps(content)
                    break
            except (json.JSONDecodeError, KeyError):
                continue
        with pytest.raises(GraphCycleError):
            chain.get_path_to_root(child)

    def test_deep_downstream(self, chain):
        root = chain.begin("Root")
        prev = root
        for i in range(10):
            prev = chain.think(f"Level {i}", parent_id=prev)
        result = chain.get_downstream(root)
        assert result["total_descendants"] == 10

    def test_node_type_enum(self):
        assert ThoughtType.BEGIN == "begin"
        assert ThoughtType.DECISION == "decision"
        assert ThoughtType.REJECTION == "rejection"

    def test_status_enum(self):
        assert ThoughtStatus.ACTIVE == "active"
        assert ThoughtStatus.REJECTED == "rejected"
        assert ThoughtStatus.SUPERSEDED == "superseded"

    def test_thought_node_dataclass(self):
        node = ThoughtNode(
            thought_id="id1",
            thought_type=ThoughtType.HYPOTHESIS,
            content="test",
        )
        assert node.thought_id == "id1"
        assert node.status == ThoughtStatus.ACTIVE
        assert node.confidence == 1.0

    def test_thought_node_to_dict(self):
        node = ThoughtNode(
            thought_id="id1",
            thought_type=ThoughtType.DECISION,
            content="choose",
            session_id="sess1",
        )
        d = node.to_dict()
        assert d["thought_type"] == "decision"
        assert d["session_id"] == "sess1"
        assert d["status"] == "active"

    def test_graph_cycle_error(self):
        err = GraphCycleError("Cycle detected: node X")
        assert isinstance(err, ValueError)
        assert "Cycle detected" in str(err)

    def test_list_sessions_multiple_chains(self, chain):
        s1 = chain.begin("First")
        chain.think("Data", parent_id=s1)
        s2 = chain.begin("Second")
        chain.think("More", parent_id=s2)
        sessions = chain.list_sessions()
        assert len(sessions) >= 2
