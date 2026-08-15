# AWS Services Integration

> **Required for hackathon submission:** *"Identify which AWS Services tools you used and how."*

Bastion's AWS footprint is **KMS** (hash-chain signing + envelope encryption) and **S3** (memory archives + CDC export). Self-healing runs in-process via `memory_heal` (hash-chain verification + reseal), not via serverless functions.

---

## 1. AWS KMS (Key Management Service)
Bastion manages encryption keys to perform zero-knowledge memory storage and tamper-evident hash-chain signing.

### Encryption Pattern
- Uses symmetric KMS keys to execute **AES-256-GCM envelope encryption** on sensitive memory text.
- Generates a local Data Encryption Key (DEK) via `generate_data_key()`.
- Binds Authenticated Additional Data (AAD) to the `agent_id` for strict multi-tenant database isolation.
- Stored content in CockroachDB contains the ciphertext and the encrypted DEK.

### Hash-Chain Signing (Asymmetric)
- An **ECC_NIST_P256 SIGN_VERIFY** key (`alias/bastion-hash-chain`) signs each memory block.
- The private key **never leaves AWS KMS** — `kms:Sign`/`kms:Verify` are called remotely.
- Even a fully compromised application server cannot forge hash-chain entries.
- Key rotation is enabled for compliance (see `terraform/main.tf`).

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

## 3. Embedding Pipeline (1024-dim Semantic Search)
- Bastion maps memory text into 1024-dimensional vectors using a resilient three-tier embedding chain:
  1. **HuggingFace Inference API** (`BAAI/bge-large-en-v1.5`) — primary, when `HF_TOKEN` is set.
  2. **Local sentence-transformers** (`all-MiniLM-L6-v2`, padded to 1024-dim) — no API key required.
  3. **Deterministic SHA-256 hash embedding** — last-resort fallback so search never stops.
- Includes a robust circuit-breaker-backed fallback system. If the HuggingFace API throttles or times out under high concurrency, Bastion automatically downgrades to the local model to maintain continuous uptime.
- All vectors are stored in CockroachDB and searched via its C-SPANN distributed vector index.
