# AWS Services Usage

> Required for hackathon submission: "Identify which AWS Services you used and how."

---

## 1. Amazon Bedrock (Foundation Models & Embeddings)

### How We Use It

Bastion uses **Amazon Bedrock Titan V2** as the embedding engine for all memory vectorization. Every memory stored in Bastion is embedded via Bedrock before being indexed in CockroachDB's C-SPANN vector index.

### Integration Code

```python
# src/bastion/kms.py
import boto3

def _get_bedrock_client():
    """Lazy-init Bedrock Runtime client for embeddings."""
    return boto3.client(
        "bedrock-runtime",
        region_name=settings.aws_region,
        read_timeout=settings.bedrock_read_timeout,
        connect_timeout=settings.bedrock_connect_timeout,
    )

def embed(self, text: str) -> list[float]:
    """Generate embedding via Bedrock Titan V2."""
    client = _get_bedrock_client()
    response = client.invoke_model(
        modelId="amazon.titan-embed-text-v2:0",
        body=json.dumps({"inputText": text}),
        contentType="application/json",
    )
    return json.loads(response["body"].read())["embedding"]
```

### Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| Model | `amazon.titan-embed-text-v2:0` | 1024-dim embeddings |
| Region | Configurable (`BASTION_AWS_REGION`) | Multi-region support |
| Read timeout | 10s | Prevent hanging on slow responses |
| Connect timeout | 10s | Fast failure on network issues |

### Free Tier Usage
- First 50M tokens/month are free
- At ~6,956 tokens/query (Mem0 benchmark), this covers ~7,200 queries/month for free
- Our mock mode uses zero Bedrock calls — all embeddings are deterministic hashes

### Why Bedrock
- No API key management needed (IAM roles)
- Native integration with CockroachDB (same AWS ecosystem)
- Titan V2 produces 1024-dim vectors optimized for semantic search
- Free tier covers hackathon-scale usage

---

## 2. AWS Bedrock for Future Enhancements (Planned)

### Bedrock Guardrails (Not Yet Implemented)
- Pre-screen content before LLM calls
- Detect harmful content, PII, and prompt injections
- Free to use with Bedrock models

### Bedrock Agents (Not Yet Implemented)
- Multi-step agentic workflows
- Built-in knowledge bases
- Could orchestrate Bastion's memory operations

---

## 3. Architecture Diagram (Text-Based)

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI AGENT CLIENT                              │
│         (Claude Code / Cursor / OpenCode / Gemini CLI)         │
└───────────────────────────┬─────────────────────────────────────┘
                            │ MCP Protocol (stdio / HTTP)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  BASTION MCP SERVER                             │
│              (FastMCP, 14 tools, 4 resources)                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │ memory_store │  │ memory_search│  │ memory_timetravel  │     │
│  │ memory_pin   │  │ memory_list  │  │ memory_audit       │     │
│  │ memory_heal  │  │ memory_health│  │ memory_apply_patch │     │
│  └─────────────┘  └──────────────┘  └────────────────────┘     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ psycopg2 (connection pool)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  COCKROACHDB CLUSTER                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │   agent_memory   │  │    agent_audit   │  │ agent_entities│  │
│  │ (C-SPANN Vectors)│  │ (Hash Chain Log) │  │ (Graph Nodes) │  │
│  │ (AS OF SYSTEM    │  │ (Append-Only)    │  │ (Relations)   │  │
│  │  TIME queries)   │  │                  │  │               │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │   a2a_tasks      │  │  saga_states     │  │agent_limiter │  │
│  │ (Agent Queue)    │  │ (Multi-Agent TX) │  │(Distributed  │  │
│  │                  │  │                  │  │ Rate Limit)  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ CDC Changefeed
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  AWS SERVICES LAYER                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                AWS Bedrock Runtime                        │   │
│  │  ┌──────────────────────┐  ┌─────────────────────────┐  │   │
│  │  │  Titan V2 Embeddings │  │  Guardrails (planned)   │  │   │
│  │  │  (1024-dim vectors)  │  │  (Content screening)    │  │   │
│  │  └──────────────────────┘  └─────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                AWS KMS (Encryption)                       │   │
│  │  ┌──────────────────────┐  ┌─────────────────────────┐  │   │
│  │  │  AES-256-GCM Encrypt │  │  Per-Tenant DEKs        │  │   │
│  │  │  (Zero-Knowledge)    │  │  (Multi-Tenant Isolation)│  │   │
│  │  └──────────────────────┘  └─────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              NEXT.JS DASHBOARD (Real-Time SSE)                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐ │
│  │ Knowledge  │  │ Time-Travel│  │ Health     │  │ Compliance│ │
│  │ Graph (D3) │  │ Slider     │  │ Dashboard  │  │ Report    │ │
│  └────────────┘  └────────────┘  └────────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Key Data Flows

1. **Memory Store**: Agent → MCP `memory_store` → Bedrock embed → CockroachDB (vector + hash chain + graph)
2. **Memory Search**: Agent → MCP `memory_search` → C-SPANN vector index → decay-weighted results
3. **Time-Travel**: Agent → MCP `memory_timetravel` → `AS OF SYSTEM TIME` → historical state
4. **Self-Healing**: CDC changefeed → Lambda → anomaly detection → auto-prune
5. **Dashboard**: SSE stream → Next.js → D3.js knowledge graph + time-travel slider

---

*This document satisfies the hackathon requirement: "Identify which AWS Services you used and how."*
