#!/usr/bin/env python
"""
Bastion Flawless Demo Script
Executes the full agent recovery and security loop with timed pauses,
allowing for stress-free video recording of the Next.js Dashboard sync.
"""

import os
import sys
import time
import uuid
from dotenv import load_dotenv

# Ensure we can load local packages
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))
from bastion.memory import BastionMemory

load_dotenv()

def log_header(msg: str):
    print(f"\n==================================================")
    print(f"  {msg.upper()}")
    print(f"==================================================")

def log_thought(msg: str):
    print(f"\n\033[95m[THINKING] 🤔 {msg}\033[0m")

def log_action(msg: str):
    print(f"\033[94m[ACTING] ⚙️ {msg}\033[0m")

def log_memory(msg: str):
    print(f"\033[92m[MEMORIZING] 💾 {msg}\033[0m")

def log_success(msg: str):
    print(f"\033[92m[SUCCESS] ✅ {msg}\033[0m")

def log_error(msg: str):
    print(f"\033[91m[ERROR] ❌ {msg}\033[0m")

def run_demo():
    conn_str = os.environ.get("BASTION_CONN", "")
    is_mock = not conn_str
    
    # Initialize connection
    memory = BastionMemory("demo-video-agent", connection_string=conn_str, mock=is_mock)
    task_id = f"task-{uuid.uuid4().hex[:8]}"

    # --- PART 1: THE ACTIVE WORKLOAD ---
    log_header("Part 1: Running Database Operations")
    
    log_thought("Initializing schema validation and loading connection pools.")
    time.sleep(2)
    
    log_memory("Saving Step 1 checkpoint to CockroachDB...")
    memory.store(
        memory_type="task",
        content="Step 1: Validate connection pool size and network latency caps.",
        metadata={"task_id": task_id, "step": 1, "status": "STARTED"}
    )
    log_success("Step 1 Committed to global ledger.")
    time.sleep(3)

    log_thought("Inspecting local relation constraints and indexing configurations.")
    time.sleep(2)
    
    log_memory("Saving Step 2 checkpoint to CockroachDB...")
    memory.store(
        memory_type="task",
        content="Step 2: Table agent_auth verified. Copied 150 schema records.",
        metadata={"task_id": task_id, "step": 2, "status": "IN_PROGRESS"}
    )
    log_success("Step 2 Committed.")
    time.sleep(4)

    # --- PART 2: THE CRASH ---
    log_header("Part 2: Simulating Process Failure")
    
    log_thought("Executing migration schema adjustments on table oauth_clients...")
    time.sleep(2)
    
    # Log step 3 start
    memory.store(
        memory_type="task",
        content="Step 3: Alter table oauth_clients add column client_level.",
        metadata={"task_id": task_id, "step": 3, "status": "IN_PROGRESS"}
    )
    
    # Simulate sudden crash
    log_error("CRITICAL ERROR: Connection dropped mid-transaction!")
    log_error(f"Agent process terminated. Context lost. Task ID: {task_id}")
    time.sleep(5)

    # --- PART 3: THE RECOVERY & RESUME ---
    log_header("Part 3: Autonomous Recovery")
    
    log_thought("Process restarted. In-memory variables lost. Querying CockroachDB for latest state...")
    time.sleep(3)
    
    # Fetch task history from database
    recent = memory.list_memories(memory_type="task", limit=10)
    task_history = [m for m in recent if m.metadata and m.metadata.get("task_id") == task_id]
    task_history.sort(key=lambda x: x.metadata.get("step", 0))
    
    last_step = task_history[-1].metadata.get("step")
    last_status = task_history[-1].metadata.get("status")
    
    log_success(f"State recovered! Found last active checkpoint: Step {last_step} ({last_status})")
    time.sleep(3)
    
    log_thought(f"Resuming migration from Step {last_step + 1}...")
    time.sleep(2)
    
    # Save step 3 completion
    memory.store(
        memory_type="task",
        content="Step 3 SUCCESS: Altered table oauth_clients cleanly.",
        metadata={"task_id": task_id, "step": 3, "status": "SUCCESS"}
    )
    log_success("Step 3 Sealed.")
    time.sleep(3)

    # Save final step
    log_thought("Checking indexing constraints and finalizing transaction.")
    time.sleep(2)
    memory.store(
        memory_type="task",
        content="Step 4 SUCCESS: Re-verified vector indexes. Task complete.",
        metadata={"task_id": task_id, "step": 4, "status": "SUCCESS"}
    )
    log_success("Step 4 Sealed.")
    time.sleep(2)
    
    log_header("Demo Complete: Self-Healing Active")

if __name__ == "__main__":
    run_demo()
