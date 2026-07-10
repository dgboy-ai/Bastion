import pytest

from bastion import BastionMemory, BehavioralDriftDetector, DriftReport


def test_drift_detector_init():
    memory = BastionMemory(agent_id="test-agent", mock=True)
    detector = BehavioralDriftDetector(memory)
    assert detector.memory is memory


def test_establish_baseline():
    memory = BastionMemory(agent_id="test-agent", mock=True)
    memory.store("fact", "User prefers Python")
    memory.store("fact", "User likes Rust")
    memory.store("preference", "Dark mode preferred")

    detector = BehavioralDriftDetector(memory)
    baseline = detector.establish_baseline("test-agent")

    assert "memory_access_pattern" in baseline
    assert "semantic_similarity" in baseline
    assert "conflict_resolution_rate" in baseline
    assert "hash_chain_gap_ratio" in baseline
    assert "retrieval_to_store_ratio" in baseline
    assert "namespace_isolation" in baseline
    assert "_meta" in baseline

    meta = baseline["_meta"]
    assert meta["agent_id"] == "test-agent"
    assert meta["total_memories"] > 0


def test_score_drift_healthy():
    memory = BastionMemory(agent_id="test-agent", mock=True)
    memory.store("fact", "User prefers Python")
    memory.store("fact", "User likes Rust")
    memory.store("preference", "Dark mode preferred")

    detector = BehavioralDriftDetector(memory)
    baseline = detector.establish_baseline("test-agent")
    report = detector.score_drift("test-agent", baseline)

    assert isinstance(report, DriftReport)
    assert report.agent_id == "test-agent"
    assert 0.0 <= report.overall_drift_score <= 1.0
    assert "memory_access_pattern" in report.dimensions
    assert "semantic_similarity" in report.dimensions
    assert report.status in ("HEALTHY", "DRIFTING", "CRITICAL")
    assert report.baseline_sessions > 0


def test_score_drift_without_baseline():
    memory = BastionMemory(agent_id="test-agent", mock=True)
    memory.store("fact", "User prefers Python")

    detector = BehavioralDriftDetector(memory)
    report = detector.score_drift("test-agent")

    assert isinstance(report, DriftReport)
    assert report.agent_id == "test-agent"


def test_drift_classification():
    from bastion.drift import _classify_drift

    assert _classify_drift(0.1, 0.3) == "HEALTHY"
    assert _classify_drift(0.3, 0.3) == "DRIFTING"
    assert _classify_drift(0.6, 0.3) == "CRITICAL"


def test_generate_recommendation():
    from bastion.drift import _generate_recommendation

    dims = {"memory_access_pattern": 0.5, "semantic_similarity": 0.1}
    rec = _generate_recommendation(dims, 0.3)
    assert "memory access" in rec
    assert "Investigate" in rec

    dims2 = {"memory_access_pattern": 0.1, "semantic_similarity": 0.1}
    rec2 = _generate_recommendation(dims2, 0.3)
    assert "No action needed" in rec2


def test_hash_gap_counting():
    from bastion.drift import _count_hash_gaps

    class FakeMem:
        def __init__(self, prev_hash, crypto_hash, created_at):
            self.previous_hash = prev_hash
            self.cryptographic_hash = crypto_hash
            self.created_at = created_at

    from datetime import UTC, datetime
    now = datetime.now(UTC)

    mems = [
        FakeMem(None, "hash1", now),
        FakeMem("hash1", "hash2", now),
        FakeMem("hash2", "hash3", now),
    ]
    assert _count_hash_gaps(mems) == 0

    mems_bad = [
        FakeMem(None, "hash1", now),
        FakeMem("wrong", "hash2", now),
        FakeMem("hash2", "hash3", now),
    ]
    assert _count_hash_gaps(mems_bad) == 1


def test_word_frequencies():
    from bastion.drift import _word_frequencies

    freqs = _word_frequencies(["User prefers Python", "Python is great"])
    assert "python" in freqs
    assert "prefers" in freqs


def test_stddev():
    from bastion.drift import _stddev

    # _stddev returns 0.1 as safety floor for zero-variance and edge cases
    assert _stddev([1, 1, 1]) == 0.1
    assert _stddev([1, 2, 3, 4, 5]) > 0
    assert _stddev([]) == 0.1
    assert _stddev([5]) == 0.1


def test_mock_store_and_recent_scores():
    memory = BastionMemory(agent_id="drift-test", mock=True)
    detector = BehavioralDriftDetector(memory)

    initial = detector.recent_scores("drift-test")
    assert initial == []

    report = detector.score_drift("drift-test")
    detector._store_drift_score("drift-test", report)

    scores = detector.recent_scores("drift-test")
    assert len(scores) == 1
    assert scores[0]["overall_drift_score"] == report.overall_drift_score
    assert scores[0]["status"] == report.status
    assert scores[0]["agent_id"] == report.agent_id


def test_drift_dimensions_all_present():
    memory = BastionMemory(agent_id="dim-test", mock=True)
    memory.store("fact", "User prefers Python")
    memory.store("instruction", "Always use type hints")

    detector = BehavioralDriftDetector(memory)
    report = detector.score_drift("dim-test")

    expected_dims = {
        "memory_access_pattern", "semantic_similarity",
        "conflict_resolution_rate", "hash_chain_gap_ratio",
        "retrieval_to_store_ratio", "namespace_isolation",
    }
    assert set(report.dimensions.keys()) == expected_dims


def test_drift_report_dataclass():
    report = DriftReport(
        agent_id="test",
        overall_drift_score=0.15,
        dimensions={"mem": 0.1},
        baseline_sessions=5,
        alert_threshold=0.3,
        status="HEALTHY",
        top_drift_signals=[],
        recommendation="All good",
    )
    assert report.agent_id == "test"
    assert report.overall_drift_score == 0.15
    assert report.status == "HEALTHY"


# ---------------------------------------------------------------------------
# Cosine vector drift tests
# ---------------------------------------------------------------------------


def test_cosine_similarity_identical():
    from bastion.drift import _cosine_similarity

    v = [1.0, 0.0, 0.0]
    assert _cosine_similarity(v, v) == 1.0


def test_cosine_similarity_orthogonal():
    from bastion.drift import _cosine_similarity

    assert _cosine_similarity([1.0, 0.0], [0.0, 1.0]) == 0.0


def test_cosine_similarity_zero_vector():
    from bastion.drift import _cosine_similarity

    assert _cosine_similarity([0.0, 0.0], [0.0, 0.0]) == 1.0


def test_cosine_similarity_partial():
    from bastion.drift import _cosine_similarity

    v1 = [1.0, 0.0]
    v2 = [0.5, 0.5]
    sim = _cosine_similarity(v1, v2)
    expected = 0.5 / (1.0 * (0.5**2 + 0.5**2) ** 0.5)
    assert abs(sim - expected) < 1e-10


def test_mean_vector():
    from bastion.drift import _mean_vector

    vecs = [[1.0, 2.0], [3.0, 4.0]]
    assert _mean_vector(vecs) == [2.0, 3.0]


def test_mean_vector_empty():
    from bastion.drift import _mean_vector

    assert _mean_vector([]) == []


def test_baseline_stores_mean_vector():
    memory = BastionMemory(agent_id="vec-test", mock=True)
    memory.store("fact", "A", metadata={"_precomputed_embedding": [0.1, 0.2]})
    memory.store("fact", "B", metadata={"_precomputed_embedding": [0.3, 0.4]})

    detector = BehavioralDriftDetector(memory)
    baseline = detector.establish_baseline("vec-test")

    sem = baseline["semantic_similarity"]
    assert "mean_vector" in sem
    assert sem["mean_vector"] == pytest.approx([0.2, 0.3])


def test_semantic_drift_detected_when_embeddings_change():
    memory = BastionMemory(agent_id="drift-test", mock=True)
    memory.store("fact", "A", metadata={"_precomputed_embedding": [0.1, 0.2]})
    memory.store("fact", "B", metadata={"_precomputed_embedding": [0.3, 0.4]})

    detector = BehavioralDriftDetector(memory)
    baseline = detector.establish_baseline("drift-test")

    # Add semantically different memories (opposite direction)
    memory.store("fact", "C", metadata={"_precomputed_embedding": [-0.1, -0.2]})
    memory.store("fact", "D", metadata={"_precomputed_embedding": [-0.3, -0.4]})

    report = detector.score_drift("drift-test", baseline)
    assert report.dimensions["semantic_similarity"] > 0.0


def test_semantic_drift_zero_when_no_change():
    memory = BastionMemory(agent_id="no-drift", mock=True)
    memory.store("fact", "A", metadata={"_precomputed_embedding": [0.1, 0.2]})
    memory.store("fact", "B", metadata={"_precomputed_embedding": [0.3, 0.4]})

    detector = BehavioralDriftDetector(memory)
    baseline = detector.establish_baseline("no-drift")

    # Add same data again (same embeddings)
    memory.store("fact", "C", metadata={"_precomputed_embedding": [0.1, 0.2]})
    memory.store("fact", "D", metadata={"_precomputed_embedding": [0.3, 0.4]})

    report = detector.score_drift("no-drift", baseline)
    assert report.dimensions["semantic_similarity"] < 0.01


def test_semantic_drift_handles_empty_embeddings():
    memory = BastionMemory(agent_id="empty-emb", mock=True)
    memory.store("fact", "A")
    memory.store("fact", "B")

    detector = BehavioralDriftDetector(memory)
    baseline = detector.establish_baseline("empty-emb")
    report = detector.score_drift("empty-emb", baseline)

    # Zero embeddings => cosine_sim returns 1.0 => drift = 0.0
    assert report.dimensions["semantic_similarity"] == 0.0
