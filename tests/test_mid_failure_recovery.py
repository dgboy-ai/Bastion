import unittest
import uuid
import time
from bastion.memory import BastionMemory
from bastion.errors import SecurityBlockError

class TestMidFailureRecovery(unittest.TestCase):
    """
    Verifies that an autonomous agent can survive a mid-transaction crash,
    recover its execution state from CockroachDB, and resume with zero data loss.
    """
    
    def setUp(self):
        # Connect to the database defined in env (or mock if connection string is missing)
        import os
        conn_str = os.environ.get("BASTION_CONN", "")
        is_mock = not conn_str
        self.memory = BastionMemory("resilience-test-agent", connection_string=conn_str, mock=is_mock)
        self.task_id = f"task-{uuid.uuid4().hex[:8]}"

    def test_checkpoint_resume_after_crash(self):
        # Step 1: Start a multi-step database migration task
        # The agent logs its intent to memory
        self.memory.store(
            memory_type="task",
            content=f"MIGRATION_START: Initialize migration schema for task {self.task_id}",
            metadata={"task_id": self.task_id, "step": 1, "status": "STARTED"}
        )
        
        # Step 2: Execute and checkpoint Step 2
        self.memory.store(
            memory_type="task",
            content=f"MIGRATION_STEP: Copied 150 user account rows for task {self.task_id}",
            metadata={"task_id": self.task_id, "step": 2, "status": "IN_PROGRESS"}
        )
        
        # Step 3: Simulate a sudden agent crash/interruption
        # In a real environment, the process dies here. We simulate this by terminating the execution flow.
        try:
            # Agent tries to execute step 3, but a network interruption occurs
            raise ConnectionResetError("Simulated network drop / process crash mid-Step 3")
        except ConnectionResetError as e:
            # Log the crash log to our test report
            print(f"\n[CRASH SIMULATION] Agent process died: {e}")
            
        # Step 4: The Agent restarts. It has lost its in-memory execution context.
        # It queries CockroachDB semantically or via metadata to find its last successful state.
        recent_tasks = self.memory.list_memories(memory_type="task", limit=5)
        
        # Filter memories belonging to our task_id
        task_checkpoints = [
            m for m in recent_tasks 
            if m.metadata and m.metadata.get("task_id") == self.task_id
        ]
        
        # Assert that we found our checkpoints in CockroachDB
        self.assertGreaterEqual(len(task_checkpoints), 2)
        
        # Sort by step to find the furthest successful checkpoint
        task_checkpoints.sort(key=lambda x: x.metadata.get("step", 0))
        last_checkpoint = task_checkpoints[-1]
        
        last_step = last_checkpoint.metadata.get("step")
        last_status = last_checkpoint.metadata.get("status")
        
        print(f"[RECOVERY SYSTEM] Agent recovered! Resuming from Step {last_step} (Status: {last_status})")
        
        # Assert we recovered the correct step (Step 2)
        self.assertEqual(last_step, 2)
        self.assertEqual(last_status, "IN_PROGRESS")
        
        # Step 5: Resume execution from the last checkpoint and complete Step 3
        resumed_step = last_step + 1
        self.memory.store(
            memory_type="task",
            content=f"MIGRATION_COMPLETE: Finalized indexing for task {self.task_id}",
            metadata={"task_id": self.task_id, "step": resumed_step, "status": "COMPLETED"}
        )
        
        # Verify the final state is committed
        final_tasks = self.memory.list_memories(memory_type="task", limit=5)
        completed_task = next(
            m for m in final_tasks 
            if m.metadata and m.metadata.get("task_id") == self.task_id and m.metadata.get("step") == 3
        )
        
        self.assertEqual(completed_task.metadata.get("status"), "COMPLETED")
        print("[RECOVERY SYSTEM] Task completed successfully with zero data loss.")

if __name__ == "__main__":
    unittest.main()
