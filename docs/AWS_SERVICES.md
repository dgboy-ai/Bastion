# AWS Services Integration

> **Required for hackathon submission:** *"Identify which AWS Services tools you used and how."*

---

## 1. AWS Lambda (Serverless CDC & Webhook Processing)
Bastion uses serverless Lambdas to execute security audits and event dispatching in response to database changes.

### Functions Deployed
1. **`CDCHandlerFunction`** (`lambda/cdc_handler.py`)
   - Receives CockroachDB changefeed events in real-time.
   - Verifies the HMAC-SHA256 hash chain of new memories to check for tamper attempts.
   - Triggers anomaly detection (fact turnover, writes spikes, size metrics).
   - Generates and stores automatic memory state snapshots to Amazon S3.
2. **`WebhookDispatcherFunction`** (`lambda/webhook_dispatcher.py`)
   - Processes state updates in `a2a_tasks` table.
   - Forwards task status change notifications to registered agent webhooks.
   - Implements a circuit breaker pattern (5 failures within 5 minutes trips the circuit).

---

## 2. Amazon S3 (Artifact & Snapshot Storage)
Bastion archives memories and stores self-healing snapshots securely.

### Configuration & Lifecycle
- **Bucket Name**: `bastion-memory-archives`
- **Versioning**: Enabled for automatic rollback capabilities.
- **Glacier Lifecycle**: Transition rules shift records to Glacier Deep Archive after 90 days, with complete expiration at 365 days.
- **Structure**:
  ```
  s3://bastion-memory-archives/
  ├── snapshots/{agent_id}/{timestamp}.json  -- State recovery snapshots
  └── archives/{agent_id}/{timestamp}.json   -- Deep archives of pruned files
  ```

---

## 3. AWS KMS (Key Management Service)
Bastion manages encryption keys to perform zero-knowledge memory storage.

### Encryption Pattern
- Uses symmetric KMS keys to execute **AES-256-GCM envelope encryption** on sensitive memory text.
- Generates a local Data Encryption Key (DEK) via `generate_data_key()`.
- Binds Authenticated Additional Data (AAD) to the `agent_id` for strict multi-tenant database isolation.
- Stored content in CockroachDB contains the ciphertext and the encrypted DEK.

---

## 4. Amazon SNS (Simple Notification Service)
- Configured in `lambda/template.yaml` as the **`bastion-alerts`** topic.
- When the `cdc_handler` detects a broken hash chain or critical memory poisoning anomaly, it publishes a notification containing the details of the breach and the timestamp of the last clean snapshot.

---

## 5. Amazon CloudWatch
- Monitors Lambda function performance, execution duration, and error rates.
- Sets up alarms on the `CDCHandlerErrors` metric to alert administrators via the SNS topic when database-to-lambda sync issues or crashes occur.

---

## 6. Embedding Pipeline (1024-dim Semantic Search)
- Bastion maps memory text into 1024-dimensional vectors using a resilient three-tier embedding chain:
  1. **HuggingFace Inference API** (`BAAI/bge-large-en-v1.5`) — primary, when `HF_TOKEN` is set.
  2. **Local sentence-transformers** (`all-MiniLM-L6-v2`, padded to 1024-dim) — no API key required.
  3. **Deterministic SHA-256 hash embedding** — last-resort fallback so search never stops.
- Includes a robust circuit-breaker-backed fallback system. If the HuggingFace API throttles or times out under high concurrency, Bastion automatically downgrades to the local model to maintain continuous uptime.
- All vectors are stored in CockroachDB and searched via its C-SPANN distributed vector index.
