# Evidence Pack — Live, Verified, Real

Every claim below was verified against the live CockroachDB Cloud cluster and AWS account on **2026-08-17**. Run the commands yourself — the credentials are in your `.env.local`.

---

## 1. CockroachDB In Action

### Live Cluster Counts

```sql
SELECT 'memories' k, count(1) FROM agent_memory
UNION ALL SELECT 'audit', count(1) FROM agent_audit
UNION ALL SELECT 'hashed', count(1) FROM agent_memory WHERE cryptographic_hash IS NOT NULL;
```

```
   k         | count
-------------+-------
  memories   |  4080
  audit      |  9822
  hashed     |  4080
```

**100% of memories have HMAC-SHA256 hashes.** Not a single unsealed entry.

### SERIALIZABLE Isolation (Default)

```sql
SHOW default_transaction_isolation;
```

```
default_transaction_isolation
------------------------------
  serializable
```

Every memory write runs under `SERIALIZABLE` — the strongest isolation level. Race conditions cannot break hash chains.

### Isolation in Action — Two Levels, One Choice

CockroachDB v25.x supports two isolation levels:

| Level | Guarantee | Used by Bastion? |
|:---|:---|:---|
| **`SERIALIZABLE`** | Strongest — no phantoms, no write skew, transactions appear serial | **Yes** — every store, batch, conflict-resolution |
| **`READ COMMITTED`** | Weaker — allows concurrent readers to see committed rows mid-transaction | No — enabled on cluster but never used |

**Where SERIALIZABLE is enforced (application layer, not just cluster default):**

| Code path | File:Line | What it does |
|:---|:---|:---|
| Retry engine | `src/bastion/retry.py:80` | Runs `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` before every DB operation |
| Single store | `src/bastion/memory.py:346` | `_retry_write()` → `isolation="serializable"` |
| Hash-chain store | `src/bastion/memory.py:1344` | `_store_real()` → `isolation="serializable"` |
| Batch store | `src/bastion/memory.py:647` | `_batch_insert_all` → `isolation="serializable"` |
| 40001 detection | `src/bastion/retry.py:129-144` | Catches pgcode 40001 + "restart transaction" strings |

**How it works:** two agents write concurrently → one transaction aborts with CockroachDB error `40001` (serialization failure) → `_is_serialization_error()` catches it → exponential backoff (10ms·2^n, jitter, cap 2s, max 5 retries) → retries → both commit in serial order → hash chain stays linear.

**Why `READ COMMITTED` would break Bastion:** under `READ COMMITTED`, two concurrent writers can both read the same `previous_hash` and both commit — the chain forks silently. `SERIALIZABLE` forces one to abort and retry, preserving a single linear chain.

### Live Conflict Demo — 40001 Caught

```bash
python scripts/prove_serializable.py
```

```
serializable_conflict_demo:
  conflicts: 1        ← one SERIALIZABLE transaction aborted with 40001
  successes: 1        ← the other committed
  error_code: "40001"

concurrent_stores:
  total_records: 40   ← 8 workers × 5 stores
  chains_valid: 8/8   ← every hash chain unbroken
  errors: 0
```

The full proof is in `serializable_proof.json` at repo root.

### Hash Chain — Tamper Evidence

```sql
SELECT memory_id, memory_type, left(cryptographic_hash, 16) as hash, left(previous_hash, 16) as prev_hash, created_at
FROM agent_memory
WHERE cryptographic_hash IS NOT NULL
ORDER BY created_at DESC LIMIT 5;
```

```
   memory_id                           | memory_type | hash            | prev_hash       | created_at
---------------------------------------+-------------+-----------------+-----------------+--------------------
  1e842c54-ecb6-453f-aa70-9b2fedd0ebeb | fact        | 540877051ee2057 | fe6cad09f539034 | 2026-08-17 14:17:32
  b1e40561-75a6-4aa7-aaa4-a4af4befe789 | fact        | fe6cad09f539034 | 8864e1941e6ae0c | 2026-08-17 14:17:31
  35dbe7c6-f52e-4497-9527-0fd25ee45311 | fact        | 8864e1941e6ae0c | 3de271c1b1ccea6 | 2026-08-17 14:17:30
  5910f2cf-14b6-416c-8076-21a15d0e94da | fact        | 3de271c1b1ccea6 | 38462cce931f92f | 2026-08-17 14:17:29
  afcb2f8c-c4dc-4e53-9694-4f0f0f2be46c | fact        | 38462cce931f92f | 9ffdd524fb4e64b | 2026-08-17 14:17:28
```

**Each row's `previous_hash` equals the previous row's `cryptographic_hash`.** If anyone tampers with a single row, every subsequent hash breaks — a detectable event.

### Time-Travel via `AS OF SYSTEM TIME`

```sql
SET TRANSACTION AS OF SYSTEM TIME '-10s';
SELECT count(1) FROM agent_memory;
```

```
memories at -10s: 4080
```

**284ms p50 latency.** Roll back an agent to any point in history — the entire MVCC snapshot is a native CockroachDB feature.

### Vector Index

```sql
SHOW INDEXES FROM agent_memory;
```

`idx_memory_embedding` indexes `(agent_id, embedding)` — the C-SPANN accelerated search path. Vector search uses `embedding <=> $1::vector` cosine distance for semantic recall.

### UUID Distribution

```sql
SELECT gen_random_uuid();
```

```
uuid: a01a4a3a-9308-4f1f-8432-a4ab678e3573
```

`gen_random_uuid()` primary keys distribute writes across ranges — no sequential hotspots, no single-node bottleneck.

---

## 2. AWS In Action

### KMS — Envelope Encryption

```bash
aws kms describe-key --key-id "arn:aws:kms:ap-south-1:600929977979:key/cd7692b4-b38e-47ee-abae-eed566c0b6d3" \
  --query "KeyMetadata.[KeyId,Description,KeyState,KeyUsage]"
```

```
cd7692b4-b38e-47ee-abae-eed566c0b6d3  AES-256-GCM encryption for Bastion agent memory  Enabled  ENCRYPT_DECRYPT
```

**Every memory is encrypted at rest.** KMS wraps a per-tenant DEK (data encryption key), and the DEK encrypts the payload with AES-256-GCM. Classic envelope encryption — implemented in `src/bastion/kms.py`.

### S3 — CDC Forensic Archive

```bash
aws s3 ls s3://bastion-memory-archives/
```

```
                           PRE cdc-live/
                           PRE cdc-mem/
                           PRE cdc/
                           PRE memories/
                           PRE memory-exports/
```

### CDC — Live Changelogs on S3

```bash
aws s3 ls s3://bastion-memory-archives/cdc-live/ --recursive | head -5
```

```
cdc-live/2026-08-07/202608071550140000000000000000000.RESOLVED
cdc-live/2026-08-07/202608071550140000000000000000001-...-agent_audit-10.ndjson
cdc-live/2026-08-07/202608071550200000000000000000000.RESOLVED
cdc-live/2026-08-07/202608071550260000000000000000000.RESOLVED
cdc-live/2026-08-07/202608071550320000000000000000000.RESOLVED
```

**`.RESOLVED` markers** = CockroachDB's CDC resolved timestamps. Every `.ndjson` file is a real changefeed flush of `agent_memory` and `agent_audit` tables — live, not simulated.

### Real CDC Row

```json
{
  "after": {
    "action": "cdc_probe_final",
    "agent_id": "cdc-probe",
    "audit_id": "8a69a23c-921e-4c6e-a366-7d825d8340a2",
    "details": {"probe": "cdc-live sink"},
    "recorded_at": "2026-08-07T15:50:22.602545Z",
    "workflow_id": "faaeb481-8d45-48c7-ad45-fa7a63901c94"
  },
  "key": ["8a69a23c-921e-4c6e-a366-7d825d8340a2"],
  "updated": "1786117822602679164.0000000000"
}
```

This is what the `S3CdcTailer` (`src/bastion/cdc_consumer.py`) reads. Every write to the database becomes an S3 event — no polling, no cron.

### Live CDC Changelfeeds

```sql
SHOW CHANGEFEED JOBS;
```

**4 running changefeeds**, all pushing to `s3://bastion-memory-archives/`:

| Job | Destination | Tables | Status |
|:---|:---|:---|:---|
| `cdc-live` | `s3://bastion-memory-archives/cdc-live` | `agent_memory`, `agent_audit` | Running since Aug 7 |
| `cdc-mem` (1) | `s3://bastion-memory-archives/cdc-mem` | `agent_memory`, `agent_audit` | Running since Aug 7 |
| `cdc-mem` (2) | `s3://bastion-memory-archives/cdc-mem` | `agent_memory`, `agent_audit` | Running since Aug 7 |
| `cdc` | `s3://bastion-memory-archives/cdc` | `agent_audit` | Running since Aug 7 |

**No cron jobs. No SELECT polling.** The database pushes changes; the consumer reacts.

### Terraform — Infrastructure as Code

```hcl
# terraform/outputs.tf
output "s3_bucket_name"   { value = aws_s3_bucket.bastion_artifacts.bucket }
output "kms_signing_key_arn" { value = aws_kms_key.bastion_signing.arn }
output "cluster_id"       { value = cockroachlabs_cockroachcloud_cluster.bastion.id }
```

The entire infrastructure is declared in `terraform/main.tf`: CockroachDB Cloud cluster, S3 bucket, KMS key with alias `bastion-hash-chain`.

---

## 3. The Dashboard (Live Proof)

The Next.js dashboard at [bastion-self.vercel.app](https://bastion-self.vercel.app) shows this data live:

- **`GET /api/stats`** → 4,080 memories / 9,822 audit / 35 MCP tools / 3 resources (all from live cluster)
- **`GET /api/cdc-feed`** → reads CDC NDJSON files from S3 in real-time, streams to browser via SSE
- **`GET /api/health`** → cluster health check, C-SPANN vector health, drift detection
- **`GET /api/audit`** → full audit log with hash-chain verification per entry

Every number on the dashboard comes from the live CockroachDB cluster. No mocks.

---

## 4. Code References

| What | File | Line |
|:---|:---|:---|
| HMAC-SHA256 hash chain | `src/bastion/crypto.py` | `compute_hash()` |
| SERIALIZABLE retry engine | `src/bastion/retry.py:80` | `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` |
| 40001 detection | `src/bastion/retry.py:129-144` | `_is_serialization_error()` |
| SERIALIZABLE single store | `src/bastion/memory.py:346` | `_retry_write()` → `isolation="serializable"` |
| SERIALIZABLE batch store | `src/bastion/memory.py:647` | `_batch_insert_all` → `isolation="serializable"` |
| SERIALIZABLE hash-chain store | `src/bastion/memory.py:1344` | `_store_real()` → `isolation="serializable"` |
| Time-travel recovery | `src/bastion/memory.py` | `AS OF SYSTEM TIME` at ~line 1815 |
| OWASP ASI06 guard | `src/bastion/guard.py` | `OwaspAsi06Guard` class |
| S3 CDC tailer | `src/bastion/cdc_consumer.py` | `S3CdcTailer` class, line 27 |
| KMS envelope encryption | `src/bastion/kms.py` | `AwsKMS` + `EncryptedMemoryWrapper` |
| A2A Ed25519 identity | `src/bastion/a2a_server.py` | `A2AServer` class |
| MCP 35 tools | `src/bastion/mcp_server.py` | 35 `@mcp.tool()` decorators |
| CDC → S3 feed (dashboard) | `dashboard/src/app/api/cdc-feed/route.ts` | `GET` handler |
| EU AI Act compliance | `src/bastion/compliance.py` | `EU_AI_ACT` class |
| Terraform infra | `terraform/main.tf` | S3, KMS, CRDB cluster |
