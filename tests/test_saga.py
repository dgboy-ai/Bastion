from unittest.mock import ANY, MagicMock, patch

import pytest

from bastion.saga import SagaBoundary, SagaMemoryManager

# ---------------------------------------------------------------------------
# SagaBoundary unit tests
# ---------------------------------------------------------------------------


def test_saga_boundary_init():
    saga = SagaBoundary(agent_id="agent-1")
    assert saga.agent_id == "agent-1"
    assert saga.status == "active"
    assert saga.operations == []


def test_saga_boundary_with_custom_id():
    saga = SagaBoundary(saga_id="custom-id", agent_id="agent-1")
    assert saga.saga_id == "custom-id"


def test_saga_boundary_add_operation():
    saga = SagaBoundary(agent_id="agent-1")
    saga.add_operation("store", "mem-1", "hello world", {"key": "val"})
    assert len(saga.operations) == 1
    assert saga.operations[0]["op_type"] == "store"
    assert saga.operations[0]["memory_id"] == "mem-1"
    assert saga.operations[0]["content"] == "hello world"


def test_saga_boundary_to_dict():
    saga = SagaBoundary(agent_id="agent-1")
    saga.add_operation("store", "mem-1", "hello")
    d = saga.to_dict()
    assert d["agent_id"] == "agent-1"
    assert d["status"] == "active"
    assert len(d["operations"]) == 1


# ---------------------------------------------------------------------------
# SagaMemoryManager mock-mode tests
# ---------------------------------------------------------------------------


def test_begin_saga_mock():
    memory = MagicMock()
    memory._mock = True
    mgr = SagaMemoryManager(memory)
    saga = mgr.begin_saga("agent-1")
    assert saga.agent_id == "agent-1"
    assert saga.status == "active"
    memory.store.assert_called_once()


def test_record_operation_mock():
    memory = MagicMock()
    memory._mock = True
    mgr = SagaMemoryManager(memory)
    saga = mgr.begin_saga("agent-1")
    mgr.record_operation(saga.saga_id, "store", "mem-1", "hello")
    assert len(saga.operations) == 1


def test_record_operation_not_found_mock():
    memory = MagicMock()
    memory._mock = True
    mgr = SagaMemoryManager(memory)
    with pytest.raises(ValueError, match="not found"):
        mgr.record_operation("nonexistent", "store", "mem-1", "hello")


def test_commit_saga_mock():
    memory = MagicMock()
    memory._mock = True
    mgr = SagaMemoryManager(memory)
    saga = mgr.begin_saga("agent-1")
    mgr.record_operation(saga.saga_id, "store", "mem-1", "hello")
    result = mgr.commit_saga(saga.saga_id)
    assert result["status"] == "committed"
    assert len(result["operations"]) == 1


def test_commit_saga_not_found_mock():
    memory = MagicMock()
    memory._mock = True
    mgr = SagaMemoryManager(memory)
    with pytest.raises(ValueError, match="not found"):
        mgr.commit_saga("nonexistent")


def test_rollback_saga_mock():
    memory = MagicMock()
    memory._mock = True
    mgr = SagaMemoryManager(memory)
    saga = mgr.begin_saga("agent-1")
    mgr.record_operation(saga.saga_id, "store", "mem-1", "hello")
    result = mgr.rollback_saga(saga.saga_id)
    assert result["status"] == "rolled_back"
    assert result["operations_rolled_back"] == 1


def test_rollback_saga_not_found_mock():
    memory = MagicMock()
    memory._mock = True
    mgr = SagaMemoryManager(memory)
    with pytest.raises(ValueError, match="not found"):
        mgr.rollback_saga("nonexistent")


def test_get_saga_mock():
    memory = MagicMock()
    memory._mock = True
    mgr = SagaMemoryManager(memory)
    saga = mgr.begin_saga("agent-1")
    result = mgr.get_saga(saga.saga_id)
    assert result is not None
    assert result["saga_id"] == saga.saga_id


def test_get_saga_nonexistent_mock():
    memory = MagicMock()
    memory._mock = True
    mgr = SagaMemoryManager(memory)
    assert mgr.get_saga("nonexistent") is None


# ---------------------------------------------------------------------------
# SagaMemoryManager DB-mode tests
# ---------------------------------------------------------------------------


def _make_db_memory():
    """Create a memory mock that behaves like a non-mock BastionMemory."""
    memory = MagicMock()
    memory._mock = False

    conn = MagicMock()
    cur = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    pool = MagicMock()
    pool.acquire.return_value = conn
    memory.get_pool.return_value = pool
    return memory, conn, cur


def test_begin_saga_db():
    memory, conn, cur = _make_db_memory()
    mgr = SagaMemoryManager(memory)
    saga = mgr.begin_saga("agent-1")
    assert saga.agent_id == "agent-1"
    assert saga.status == "active"
    # Find the INSERT call among all execute calls
    insert_found = any(
        "INSERT INTO saga_states" in (call[0][0] if call[0] else "")
        for call in cur.execute.call_args_list
    )
    assert insert_found, "No INSERT INTO saga_states found in execute calls"
    cur.execute.assert_any_call(
        ANY,
        (saga.saga_id, "agent-1"),
    )
    conn.commit.assert_called()
    memory.store.assert_called_once()


def test_record_operation_db():
    memory, conn, cur = _make_db_memory()
    mgr = SagaMemoryManager(memory)
    saga = mgr.begin_saga("agent-1")
    cur.reset_mock()
    conn.reset_mock()

    mgr.record_operation(saga.saga_id, "store", "mem-1", "hello")
    calls = [args[0][0] for args in cur.execute.call_args_list]
    assert any("UPDATE saga_states SET operations = operations ||" in c for c in calls)


def test_record_operation_not_found_db():
    memory, conn, cur = _make_db_memory()
    cur.rowcount = 0
    mgr = SagaMemoryManager(memory)
    with pytest.raises(ValueError, match="not found"):
        mgr.record_operation("nonexistent", "store", "mem-1", "hello")


def test_commit_saga_db():
    memory, conn, cur = _make_db_memory()
    cur.rowcount = 1
    cur.fetchone.return_value = (
        "saga-1", "agent-1", "committed",
        [{"op_type": "store", "memory_id": "mem-1"}],
        "2025-01-01T00:00:00+00:00", "2025-01-01T01:00:00+00:00",
    )
    mgr = SagaMemoryManager(memory)
    saga = mgr.begin_saga("agent-1")
    cur.reset_mock()
    cur.fetchone.return_value = (
        "saga-1", "agent-1", "committed",
        [{"op_type": "store", "memory_id": "mem-1"}],
        "2025-01-01T00:00:00+00:00", "2025-01-01T01:00:00+00:00",
    )

    result = mgr.commit_saga(saga.saga_id)
    assert result["status"] == "committed"
    assert len(result["operations"]) == 1


def test_commit_saga_not_found_db():
    memory, conn, cur = _make_db_memory()
    cur.rowcount = 0
    mgr = SagaMemoryManager(memory)
    saga = mgr.begin_saga("agent-1")
    with pytest.raises(ValueError, match="not found"):
        mgr.commit_saga(saga.saga_id)


def test_rollback_saga_db():
    memory, conn, cur = _make_db_memory()
    mgr = SagaMemoryManager(memory)
    saga = mgr.begin_saga("agent-1")
    mgr.record_operation(saga.saga_id, "store", "mem-1", "hello")

    # Mock fetchone to return operations for rollback
    cur.fetchone.return_value = (
        [{"op_type": "store", "memory_id": "mem-1"}],
    )
    cur.rowcount = 1

    result = mgr.rollback_saga(saga.saga_id)
    assert result["status"] == "rolled_back"
    assert result["operations_rolled_back"] == 1


def test_rollback_saga_not_found_db():
    memory, conn, cur = _make_db_memory()
    cur.fetchone.return_value = None
    mgr = SagaMemoryManager(memory)
    with pytest.raises(ValueError, match="not found"):
        mgr.rollback_saga("nonexistent")


def test_get_saga_db():
    memory, conn, cur = _make_db_memory()
    cur.fetchone.return_value = (
        "saga-1", "agent-1", "active",
        [{"op_type": "store", "memory_id": "mem-1"}],
        "2025-01-01T00:00:00+00:00", None,
    )
    mgr = SagaMemoryManager(memory)
    result = mgr.get_saga("saga-1")
    assert result is not None
    assert result["saga_id"] == "saga-1"
    assert result["status"] == "active"


def test_get_saga_nonexistent_db():
    memory, conn, cur = _make_db_memory()
    cur.fetchone.return_value = None
    mgr = SagaMemoryManager(memory)
    assert mgr.get_saga("nonexistent") is None


def test_saga_table_auto_created():
    memory, conn, cur = _make_db_memory()
    mgr = SagaMemoryManager(memory)
    mgr.begin_saga("agent-1")
    create_calls = [args[0][0] for args in cur.execute.call_args_list
                    if "CREATE TABLE IF NOT EXISTS saga_states" in str(args[0][0])]
    assert len(create_calls) == 1


def test_saga_table_created_once():
    memory, conn, cur = _make_db_memory()
    memory._mock = False
    mgr = SagaMemoryManager(memory)

    mgr.begin_saga("agent-1")
    cur.reset_mock()
    mgr.begin_saga("agent-2")
    create_calls = [args for args in cur.execute.call_args_list
                    if "CREATE TABLE" in str(args)]
    assert len(create_calls) == 0


@patch("bastion.saga.datetime")
def test_rollback_saga_writes_compensating_events(mock_dt):
    memory = MagicMock()
    memory._mock = True
    mgr = SagaMemoryManager(memory)
    saga = mgr.begin_saga("agent-1")
    mgr.record_operation(saga.saga_id, "store", "mem-1", "hello")
    mgr.record_operation(saga.saga_id, "store", "mem-2", "world")
    mgr.rollback_saga(saga.saga_id)

    # Rollback uses delete_memory for store operations
    assert memory.delete_memory.call_count == 2


def test_rollback_saga_guards_against_double_complete():
    """Rollback UPDATE must check status = 'active' to prevent race with commit."""
    memory, conn, cur = _make_db_memory()
    cur.fetchone.return_value = ([{"op_type": "store", "memory_id": "mem-1"}],)
    cur.rowcount = 0
    mgr = SagaMemoryManager(memory)
    with pytest.raises(ValueError, match="not found or already completed"):
        mgr.rollback_saga("saga-1")
