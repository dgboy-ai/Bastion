# Bastion - AWS Integration for CockroachDB x AWS Hackathon

> Submission requirement: *"Identify which AWS Services tools you used and how."*
> Deadline: Aug 19, 2026. Prizes up to $8,750. 3 min video + public MIT repo + diagram.

## Decision: Primary = Amazon S3, Bonus = AWS Lambda

We picked **S3 as the primary, dashboard-visible AWS service** (cold archive of agent memory,
backing up CockroachDB's hot memory tier). **Lambda is documented infra but optional for the demo.**
Rationale in "Decision" section below.

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
- `lambda/setup_s3.py` - creates `bastion-memory-archives`, enables versioning, Glacier 90d / expire 365d lifecycle, uploads a sample archive. Bucket ARN `arn:aws:s3:::bastion-memory-archives`.
- `lambda/cdc_handler.py` - CDC Lambda writes/reads S3 snapshots (`s3://{BASTION_S3_BUCKET}/snapshots/{agent}/{ts}.json`).
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

## 2. AWS Lambda - CDC & Webhook Processing (BONUS / documented infra)
- `lambda/cdc_handler.py`: verifies HMAC-SHA256 hash chain on changes, detects anomalies, writes S3 snapshots, SNS alert on break.
- `lambda/webhook_dispatcher.py`: SQS + circuit breaker for A2A task webhook dispatch.
- Requires deployed function + IAM execution role (`deploy_direct.py` / `template.yaml` SAM). Cold start adds latency / risk to a live demo.

---

## 3. Other AWS already used
| Service | Use |
|---------|-----|
| AWS KMS | AES-256-GCM envelope encryption (BastionEncryption key), AAD bound to agent_id |
| Amazon SNS | `bastion-alerts` topic on broken hash chain / poisoning |
| CloudWatch | Lambda metrics + `CDCHandlerErrors` alarm |

---

## Decision: S3 (wear now)
- **S3 ties perfectly to the CockroachDB narrative** (hot vs cold tier) - judges see a meaningful reason for both DBs.
- **Visible + instant**: click Export -> bucket/key/rows -> open S3 Console. Live demo = low risk.
- **Cheap/free** and has **no IAM role / cold-start / invocation failure** surface (Lambda deps do).
- Lambda is more "impressive" but is **heavier & riskier** (role + deployment + concurrency + latency) for a <3min video/live demo, and its payoff is lower than a reliable S3 export.

**Recommended**: Implement the S3 export proof now (ing visible in playground). Add a Lambda "Run Agent on Lambda"-demo/button later **only if time remains** - treat it as bonus, not required.

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