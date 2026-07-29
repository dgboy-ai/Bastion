# Deployment & Cloud Scaling Guide

This document details Bastion's deployment layouts, AWS SAM templates, Terraform IaC structures, and serverless connection pooling parameters.

---

## 🏗️ AWS Infrastructure Deployment

Bastion provides two paths for cloud provisioning: **Terraform** for core AWS resources, and **AWS SAM** for serverless event-driven changefeed handlers.

### 1. Terraform Infrastructure (`terraform/`)
Our Terraform configurations manage persistent storage and security keys:
- **`main.tf`** — Provisions the AWS KMS Key for envelope encryption and the Amazon S3 Bucket (`bastion-memory-archives`) with Glacier lifecycle rules and versioning enabled.
- **`variables.tf`** & **`outputs.tf`** — Parameterizes deployment regions (`us-east-1`, `ap-south-1`) and returns key ARNs and bucket URLs.

```bash
# Apply Terraform IaC
cd terraform
terraform init
terraform apply -var="region=ap-south-1"
```

### 2. AWS SAM / Serverless Deployment (`lambda/`)
The event-driven self-healing pipeline (CDC handler and Webhook dispatcher) is deployed using AWS SAM:
- **`template.yaml`** — Defines the AWS Serverless Application Model schema, including:
  - `CDCHandlerFunction` (polls and processes DB changefeeds)
  - `WebhookDispatcherFunction` (delivers A2A notification webhooks)
  - `CDCHandlerErrors` CloudWatch Alarms
  - `AlertSNSTopic` SNS topic for SMS/email alerting on breach.

```bash
# Package and deploy using SAM CLI or our python helper
python lambda/deploy.py --conn "$BASTION_CONN" --stack bastion-lambda --region ap-south-1
```

---

## 🚰 Serverless Connection Pool Tuning

Stateless environments (AWS Lambda, Vercel/Render Web Services) scale rapidly. To prevent database connection starvation, Bastion enforces strict connection limits:

| Pool Config | Value | Purpose |
| :--- | :---: | :--- |
| `pool_min_size` | **1** | Retains a warm connection to minimize cold start execution latency. |
| `pool_max_size` | **2** | Hard cap on database handles per serverless instance to prevent overloading. |
| `max_idle_seconds` | **300** | Cleans up idle connections to free DB slots. |

---

## 📦 Docker Local Stack Setup

For local multi-worker testing, a `docker-compose.yml` configures the full topology:
- **`bastion-db`**: CockroachDB running in single-node mode.
- **`bastion-mcp`**: The MCP service exposing 35 tools.
- **`bastion-a2a`**: The FastAPI A2A signed card server.

Run the local compose stack:
```bash
docker compose up --build
```
