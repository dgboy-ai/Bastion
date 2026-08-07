# Bastion - AWS Integration for CockroachDB x AWS Hackathon

> Submission requirement: *"Identify which AWS Services tools you used and how."*
> Deadline: Aug 19, 2026. Prizes up to $8,750. 3 min video + public MIT repo + diagram.

## Decision: Primary = Amazon S3, Core = AWS KMS

We picked **S3 as the primary, dashboard-visible AWS service** (cold archive of agent memory,
backing up CockroachDB's hot memory tier) and **AWS KMS as the integrity core** (hash-chain
signing + envelope encryption). Self-healing runs in-process via `memory_heal`.

---

## 1. Amazon S3 - Cold Memory Archive (PRIMARY for demo)

### Purpose
Long-term immutable storage of agent memory exports: compliance, audit, retraining, DR.
Complements CockroachDB (hot tier, ms latency, vector) with an S3 (cold tier, archive). 

### Architecture
```
  Agent Runtime  --store-->  CockroachDB  --export-->  S3 bucket
     (hot)                    (distributed SQL +      (cold archive)
                              vector, hash chain)
    ms latency             SERIALIZABLE,          append-only,
    transactional          AS OF SYSTEM TIME,     immutable,
                           C-SPANN index          compliance-ready
```

### Existing backend infra (already in repo)
- `src/bastion/archive.py` - writes memory archives to `bastion-memory-archives`, with Glacier 90d / expire 365d lifecycle.
- `terraform/main.tf` - provisions the bucket + KMS signing key (`alias/bastion-hash-chain`).
- `docs/memory_architecture.md` Layer 2: "S3 snapshots + Glacier lifecycle."

### Dashboard-visible demo plan
- `src/lib/s3.ts`: `S3Client` + `exportAgentMemory(agentId, data)` -> `PutObjectCommand` to
  `memory-exports/{agentId}/{Date.now()}.json`.
- `/api/demo/export/route.ts`: POST, read memories via `safeQueryStatic()`, upload, return `{bucket,key,count,url}`.
- Playground "Export to S3" button + result card (bucket / key / rows / S3 Console link).
- Env (`dashboard/.env.local`, gitignored): `AWS_REGION=ap-south-1`, `BASTION_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

### Cost
~1,600 PUTs ever (~$0.008). Effectively free - safe for live demo.

---

## 2. AWS KMS - Hash-Chain Signing + Envelope Encryption (CORE)
- `src/bastion/kms.py`: AES-256-GCM envelope encryption with AAD bound to `agent_id`.
- `src/bastion/kms_signing.py`: ECDSA-P256 asymmetric signing — private key never leaves KMS.
- `terraform/main.tf`: `aws_kms_key.bastion_signing` (ECC_NIST_P256, SIGN_VERIFY) + alias.

---

## 3. Other AWS already used
| Service | Use |
|---------|-----|
| Amazon S3 | Cold memory archives (`bastion-memory-archives`) with Glacier lifecycle |
| AWS KMS | AES-256-GCM envelope encryption + ECDSA hash-chain signing |
| Amazon Bedrock | High-fidelity embedding fallback (`amazon.titan-embed-text-v2`) |

---

## Decision: S3 (wear now)
- **S3 ties perfectly to the CockroachDB narrative** (hot vs cold tier) - judges see a meaningful reason for both DBs.
- **Visible + instant**: click Export -> bucket/key/rows -> open S3 Console. Live demo = low risk.
- **Cheap/free** and has **no IAM role / cold-start / invocation failure** surface.
- **KMS is the integrity story**: tamper-evident hash chains signed by a key that never leaves AWS.

**Recommended**: Implement the S3 export proof now (visible in playground). KMS signing + envelope encryption are already production features.

---

## Files to touch
- `dashboard/src/lib/s3.ts` (new), `dashboard/src/app/api/demo/export/route.ts` (new)
- `dashboard/src/app/playground/Content.tsx` (add button + result card)
- `dashboard/package.json` (+ `@aws-sdk/client-s3`)
- `dashboard/.env.local` (AWS creds - gitignored, never commit)

## Danger
- NEVER `git commit`/`git push` without explicit permission (AGENTS.md).
- S3 bucket must be created in account first (`aws s3 mb s3://bastion-memory-archives --region ap-south-1`) + IAM `s3:PutObject`.
- No `&&` in PowerShell; `Get-Process node` to confirm dev server; dev :3000.