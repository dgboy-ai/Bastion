# Bastion — Agentic Memory Infrastructure on CockroachDB

[![CI](https://github.com/dgboy-ai/Bastion/actions/workflows/ci.yml/badge.svg)](https://github.com/dgboy-ai/Bastion/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Memory that survives crashes — so AI agents never forget.

AI engineering teams use Bastion to give their agents crash-proof memory by storing every session, decision, and state on CockroachDB — so when an agent restarts, it remembers exactly where it left off.

## Features

- **Crash Recovery** — Hash-chained memory records, detect tampering on restart
- **Vector Search** — Semantic similarity via C-SPANN indexes (with exact `<=>` fallback)
- **Time Travel** — `AS OF SYSTEM TIME` queries for point-in-time recall
- **Conflict Resolution** — LLM-powered merge of contradictory facts
- **Audit Trail** — Append-only log of every memory operation
- **Healing** — Automatic TTL-based memory pruning
- **Diffing** — Compare memory state between any two timestamps
- **CDC Streaming** — CockroachDB changefeeds → AWS Lambda (deferred)

## SDKs

| Language | Package | Status |
|----------|---------|--------|
| Python   | `bastion-memory` | ✅ 20 tests |
| TypeScript | `bastion-memory` | ✅ 14 tests |

## Quick Start

```python
from bastion import BastionMemory

memory = BastionMemory("my-agent", mock=True)
record = await memory.store("fact", "User prefers Python")
results = await memory.search("Python")
```

```typescript
import { BastionMemory } from "bastion-memory";

const memory = new BastionMemory("my-agent", undefined, true);
const record = await memory.store("fact", "User prefers Python");
const results = await memory.search("Python");
```

## License

MIT
