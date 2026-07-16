# AWS Services Usage

> Required for hackathon submission: "Identify which AWS Services you used and how."

---

## 1. Amazon Bedrock (Foundation Models & Embeddings)

### How We Use It

Bastion uses **Amazon Bedrock Titan V2** as the embedding engine for all memory vectorization. Every memory stored in Bastion is embedded via Bedrock before being indexed in CockroachDB's C-SPANN vector index.

### Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| Model | `amazon.titan-embed-text-v2:0` | 1024-dim embeddings |
| Region | Configurable (`AWS_REGION`) | Multi-region support |
| Read timeout | 10s | Prevent hanging on slow responses |
| Connect timeout | 10s | Fast failure on network issues |
| Circuit breaker | 5 failures → open, 30s recovery | Graceful degradation |

### Fallback
When Bedrock is unavailable (throttled/down), Bastion automatically falls back to:
1. **all-MiniLM-L6-v2** (local, 384-dim, no API key)
2. **Hash-based embedding** (deterministic, 1024-dim)

---

## 2. AWS Lambda (Serverless Agent Execution)

### Lambda Functions

| Function | Purpose | Timeout | Memory |
|----------|---------|---------|--------|
| `bastion-cdc-handler` | CDC changefeed processor — hash chain verification, drift detection, self-healing | 60s | 256MB |
| `bastion-webhook-dispatcher` | A2A webhook push notification delivery with retries | 60s | 256MB |

### CDC Handler Capabilities
- **Hash chain verification** — detects tampered memories
- **Drift detection** — monitors behavioral changes across 6 dimensions
- **Self-healing** — prunes expired memories automatically
- **Alerting** — sends notifications on anomalies

### Webhook Dispatcher Capabilities
- **Push notification delivery** — POST to registered callback URLs
- **Retry logic** — 3 retries with exponential backoff
- **Deduplication** — prevents duplicate notifications

### Deployment
```bash
# Package and deploy
python lambda/deploy_direct.py

# Or deploy manually via AWS Console
```

---

## 3. Amazon S3 (Artifact & Document Storage)

### Usage
- **Memory archives** with versioning and Glacier lifecycle
- **Audit trail backups**
- **Self-healing snapshots**

### Bucket Configuration
| Setting | Value |
|---------|-------|
| Bucket | `bastion-memory-archives` |
| Region | `ap-south-1` |
| Versioning | Enabled |
| Lifecycle | 90-day Glacier transition, 365-day expiration |

### Bucket Structure
```
s3://bastion-memory-archives/
├── memories/
│   └── {agent_id}/
│       └── archive-{timestamp}.json
└── snapshots/
    └── {agent_id}/
        └── snapshot-{timestamp}.json
```

### Archive Format
```json
{
  "agent_id": "demo-agent",
  "memory_count": 25,
  "hash_chain_intact": true,
  "created_at": "2026-07-16T00:00:00Z",
  "memories": [...]
}
```

---

## 4. AWS KMS (Key Management Service)

### Usage
- **AES-256-GCM envelope encryption** for agent memory content
- **Per-tenant Data Encryption Keys (DEKs)** for zero-knowledge search
- **AAD bound to agent_id** for tenant isolation

### Key Configuration
| Setting | Value |
|---------|-------|
| Key ARN | `arn:aws:kms:ap-south-1:600929977979:key/cd7692b4-b38e-47ee-abae-eed566c0b6d3` |
| Key spec | SYMMETRIC_DEFAULT |
| Key usage | Encrypt and decrypt |
| Origin | AWS KMS |

### Encryption Flow
1. Generate Data Encryption Key (DEK) via KMS `generate_data_key()`
2. Cache DEK locally (one KMS API call per process)
3. Encrypt memory content with DEK (AES-256-GCM)
4. Store encrypted content + encrypted DEK in CockroachDB
5. Embed plaintext vector for semantic search (zero-knowledge)
6. Decrypt on retrieval only

### Implementation
```python
from bastion.kms import AwsKMS, EncryptedMemoryWrapper

kms = AwsKMS()  # Uses BASTION_AWS_KMS_KEY_ARN env var
encrypted_mem = EncryptedMemoryWrapper(memory_engine, kms=kms)

# Store encrypted
encrypted_mem.store("fact", "sensitive data")

# Search works on plaintext vectors (zero-knowledge)
results = encrypted_mem.search("sensitive data")

# Content is decrypted on retrieval
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT CLIENT                              │
│           (Claude / Cursor / LangGraph)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP Protocol (25 tools)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   BASTION MCP SERVER                         │
│              (25 tools, 4 resources, 3 prompts)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
           ┌───────────┴───────────┐
           ▼                       ▼
┌──────────────────┐  ┌──────────────────┐
│  AWS KMS         │  │  Amazon S3       │
│  AES-256-GCM     │  │  Memory archives │
│  Envelope encr.  │  │  Glacier lifecycle│
└──────────────────┘  └──────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    COCKROACHDB CLUSTER                       │
│         (C-SPANN vectors, SERIALIZABLE, CDC)                │
└──────────────────────┬──────────────────────────────────────┘
                       │ CDC Changefeed
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    AWS LAMBDA                                │
│  CDC Handler (hash verify, drift detect, self-heal)         │
│  Webhook Dispatcher (push notifications, retries)           │
└─────────────────────────────────────────────────────────────┘
                       │
           ┌───────────┴───────────┐
           ▼                       ▼
┌──────────────────┐  ┌──────────────────┐
│  Amazon Bedrock  │  │  Amazon S3       │
│  Titan V2 embeds │  │  Archive storage │
│  1024-dim        │  │  Versioning      │
└──────────────────┘  └──────────────────┘
```

---

## Summary

| Service | Usage | Status |
|---------|-------|--------|
| **Amazon Bedrock** | Titan V2 embeddings with circuit breaker | Verified |
| **AWS Lambda** | CDC handler + webhook dispatcher | Code ready, deployable |
| **Amazon S3** | Memory archives with Glacier lifecycle | Verified |
| **AWS KMS** | AES-256-GCM envelope encryption | Verified |

---

*This document satisfies the hackathon requirement: "Identify which AWS Services you used and how."*
