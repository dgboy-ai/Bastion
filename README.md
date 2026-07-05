# Bastion — Production-Grade Persistent Memory for AI Agents

[![CI](https://github.com/dgboy-ai/Bastion/actions/workflows/ci.yml/badge.svg)](https://github.com/dgboy-ai/Bastion/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CockroachDB](https://img.shields.io/badge/Database-CockroachDB-000000?logo=cockroachlabs&logoColor=white)](https://cockroachlabs.cloud)
[![AWS](https://img.shields.io/badge/Cloud-AWS-232F3E?logo=amazon-aws&logoColor=white)](https://aws.amazon.com)

AI agents in production need memory that never goes down. When an agent experiences a container crash or a network partition, it shouldn't degrade or lose context—it should resume execution seamlessly.

**Bastion** is a production-grade, globally distributed agentic memory infrastructure built natively on **CockroachDB** and **AWS**. It ensures that every conversation state, episodic recall, semantic index, and relation persists across failures, regions, and scale with zero data loss.

---

## 🛰️ System Architecture

Bastion bridges the gap between transactional databases, vector indexing, and agent orchestration frameworks:

```
                  ┌────────────────────────────────────────┐
                  │          AI Orchestrator               │
                  │   (LangChain / CrewAI / LlamaIndex)    │
                  └───────────────────┬────────────────────┘
                                      │
                         [Read/Write Memory & Graph]
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │          Bastion Memory SDK            │
                  └───────────────────┬────────────────────┘
                                      │
                        [Consensus & Vector Retrieval]
                                      │
                                      ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                              AWS CLOUD                                 │
 │                                                                        │
 │   ┌─────────────────────────┐          ┌───────────────────────────┐   │
 │   │     Amazon Bedrock      │          │     CockroachDB Cloud     │   │
 │   │ (Titan Vector Embeds &  │          │   (Multi-Region Vector    │   │
 │   │  Claude Reasoning LMs)  │          │    Index, Entity Graph,   │   │
 │   └────────────┬────────────┘          │    Transaction Logs)      │   │
 │                │                       └─────────────┬─────────────┘   │
 │                │ [Embeddings & Resolutions]          │                 │
 │                └─────────────────────────────────────┘                 │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Key Capabilities

* **🔒 Cryptographic Integrity Hash-Chains:** Every memory record stores a SHA-256 hash of its contents combined with the hash of the preceding memory block. Tampering or record omission is instantly flagged on agent initialization.
* **🕰️ Point-in-Time Time Travel:** Leverages CockroachDB's `AS OF SYSTEM TIME` capability to query the exact cognitive state of the agent at any past timestamp.
* **🌐 Dynamic Knowledge Graph:** Maintains a structured entity and relationship map (`agent_entities` and `agent_relations` tables) to resolve multi-hop context queries and reasoning.
* **🧬 LLM-Powered Conflict Resolution:** Detects contradictions between new observations and historical records, triggering reasoning models to merge or reconcile facts.
* **🍂 Cognitive Importance Decay:** A dynamic decay algorithm tracks memory access counts and degrades importance weights over time, prioritizing fresh or frequently recalled context.
* **🔌 Native MCP Server Integration:** Fully supports the Model Context Protocol (MCP) to let Cursor, Claude Code, and VS Code agents interact with the database using standard configurations.

---

## 📦 Package Status

| Language | Package Name | Status | Real DB Driver |
| :--- | :--- | :--- | :--- |
| **Python** | `bastion-memory` | `v0.1.0` (72 tests passed) | `psycopg` (Production Ready) |
| **TypeScript** | `bastion-memory` | `v0.1.0` (14 tests passed) | `pg` (Production Ready) |

---

## 🚀 Quick Start

### 1. Database Schema Deployment
Ensure you have the schemas applied to your CockroachDB cluster. Run the migrations script:
```bash
export BASTION_CONN="postgresql://<user>:<pass>@<host>:26257/defaultdb?sslmode=verify-full"
python scripts/apply_schema.py
```

### 2. Python SDK Example
Install the package:
```bash
pip install bastion-memory
```

Write your agent memory script:
```python
import asyncio
from bastion import BastionMemory

async def main():
    # Connect to the live cluster (requires BASTION_CONN environment variable)
    memory = BastionMemory(agent_id="finance-agent")
    
    # Store a memory (automatically generates embedding via Bedrock Titan V2)
    record = await memory.store(
        memory_type="fact",
        content="The client prefers quarterly reports formatted in Excel."
    )
    print(f"Stored Fact. Hash Chain Ref: {record.cryptographic_hash}")
    
    # Query memory with semantic search
    results = await memory.search("preferred report layout", limit=3)
    for result in results:
        print(f"Recalled: {result.content} (Score: {result.importance_score})")

asyncio.run(main())
```

### 3. TypeScript SDK Example
Install the dependencies:
```bash
npm install bastion-memory
```

Implement the memory interface:
```typescript
import { BastionMemory } from "bastion-memory";

async function run() {
  const memory = new BastionMemory("finance-agent");
  
  // Store factual node
  const record = await memory.store("fact", "User prefers dark mode layouts.");
  console.log(`Stored Memory Node: ${record.memoryId}`);
  
  // Query vectors
  const queries = await memory.search("preferred design layouts");
  console.log("Results found:", queries.length);
}

run();
```

---

## 🛠️ Model Context Protocol (MCP) Server Setup
To configure your editor (Cursor, Claude Code, etc.) to query Bastion directly, add the MCP Server configuration:

```json
{
  "mcpServers": {
    "bastion-memory": {
      "command": "python",
      "args": ["-m", "bastion.mcp_server"],
      "env": {
        "BASTION_CONN": "postgresql://divyansh:<pass>@bastion-memory-28736.j77.aws-ap-south-1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full",
        "AWS_REGION": "ap-south-1"
      }
    }
  }
}
```

---

## 🧪 Running the Test Suite
We run style diagnostics and test assertions on every commit. Run them locally:

```bash
# Python Tests
ruff check
pytest

# TypeScript Tests
cd sdk/typescript
npm install
npm test
```

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
