# AWS Services Usage

> Required for hackathon submission: "Identify which AWS Services you used and how."

---

## 1. Amazon Bedrock (Foundation Models & Embeddings) ✅

### How We Use It

Bastion uses **Amazon Bedrock Titan V2** as the embedding engine for all memory vectorization. Every memory stored in Bastion is embedded via Bedrock before being indexed in CockroachDB's C-SPANN vector index.

### Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| Model | `amazon.titan-embed-text-v2:0` | 1024-dim embeddings |
| Region | Configurable (`BASTION_AWS_REGION`) | Multi-region support |
| Read timeout | 10s | Prevent hanging on slow responses |
| Connect timeout | 10s | Fast failure on network issues |

### Free Tier Usage
- First 50M tokens/month are free
- Covers ~7,200 queries/month for free
- Mock mode uses zero Bedrock calls

---

## 2. AWS Lambda ✅

### Lambda Functions

| Function | Purpose | Timeout | Memory |
|----------|---------|---------|--------|
| `CdcHandlerFunction` | CDC changefeed processor | 60s | 256MB |
| `WebhookDispatcherFunction` | A2A webhook push | 30s | 128MB |
| `WebhookDispatcherHealthFunction` | Health check | 10s | 128MB |

### EventBridge Rules

| Rule | Purpose | Rate |
|------|---------|------|
| `KeepAliveRule` | Cold start mitigation | Every 5 minutes |

---

## 3. Amazon S3 ✅

### Usage
- **Memory archives** with lifecycle to Glacier
- **Snapshot storage** for self-healing
- **Audit trail backups**

### Bucket Structure
```
s3://bastion-{env}/
├── archives/          # Memory archives
├── snapshots/         # Self-healing snapshots
└── audit/             # Audit trail backups
```

---

## 4. AWS KMS ✅

### Usage
- **AES-256-GCM** envelope encryption
- **Per-tenant DEKs** for zero-knowledge search
- **AAD bound to agent_id** for tenant isolation

### Encryption Flow
1. Generate Data Encryption Key (DEK) via KMS
2. Encrypt memory content with DEK
3. Store encrypted content + encrypted DEK in CockroachDB
4. Embed plaintext vector for search
5. Decrypt on retrieval only

---

## 5. Amazon SNS ✅

### Usage
- **Alert topic** for chain break alerts
- **Notification** for critical security events

### Alert Types
- Hash chain break detected
- Memory poisoning attempt
- Confidentiality breach

---

## 6. Amazon SQS ✅

### Usage
- **Retry queue** for webhook backlog
- **Dead letter queue** for failed dispatches

### Queue Configuration
- Visibility timeout: 30s
- Max retries: 3
- Dead letter queue after 3 failures

---

## 7. Amazon EventBridge ✅

### Usage
- **Keep-alive rule** for Lambda cold start mitigation
- **Scheduled rule** every 5 minutes

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT CLIENT                              │
│           (Claude / Cursor / LangGraph)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP Protocol
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   BASTION MCP SERVER                         │
│              (25 tools, 4 resources, 3 prompts)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    COCKROACHDB CLUSTER                       │
│         (6 regions, SERIALIZABLE isolation)                  │
└──────────────────────┬──────────────────────────────────────┘
                       │ CDC Changefeed
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                       AWS LAYER                              │
│  Bedrock (embeddings) │ Lambda (CDC) │ S3 (archives)        │
│  KMS (encryption)     │ SNS (alerts) │ SQS (retries)        │
│  EventBridge (keep-alive)                                    │
└─────────────────────────────────────────────────────────────┘
```

---

*This document satisfies the hackathon requirement: "Identify which AWS Services you used and how."*
