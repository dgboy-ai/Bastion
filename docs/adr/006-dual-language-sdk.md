# ADR 006: Python + TypeScript SDK with 1:1 API Parity

## Status
Accepted

## Context
AI agents are built in diverse ecosystems:
- Python: LangChain, CrewAI, LlamaIndex, custom scripts
- TypeScript/Node.js: Vercel AI SDK, LangChain.js, custom agents

A memory system that only supports one language locks out half the ecosystem. Most competing tools (Mem0, Zep) are Python-only.

## Decision
Ship two SDKs with identical API surfaces:

**Python** (`bastion-memory` on PyPI):
```python
from bastion import BastionMemory
mem = BastionMemory("agent-id")
mem.store("fact", "content")
mem.search("query")
```

**TypeScript** (`bastion-memory` on npm):
```typescript
import { BastionMemory } from "bastion-memory";
const mem = new BastionMemory("agent-id");
await mem.store("fact", "content");
await mem.search("query");
```

Both SDKs share the same CockroachDB schema and are wire-compatible.

## Consequences

### Positive
- Every ecosystem can adopt Bastion (Python + TypeScript covers 90%+ of AI agents)
- Framework adapters (LangChain, CrewAI, LlamaIndex) work across both
- npm + PyPI distribution maximizes reach
- 1:1 parity means documentation applies to both

### Negative
- Double the codebase to maintain
- Test coverage must be maintained for both SDKs
- Bug fixes need to be ported between languages

### Mitigations
- TypeScript SDK mirrors Python SDK structure (easy to port changes)
- Shared test scenarios ensure behavioral parity
- CI runs both test suites on every commit
