# Deployment & Cloud Scaling Guide

This document details Bastion's deployment layouts, connection-pool limits, and serverless parameters designed for AWS and Vercel.

---

## 🚰 Serverless Connection Pool Tuning

Stateless serverless environments (AWS Lambda, Vercel Functions) scale rapidly by booting up new, short-lived container instances. If connection boundaries are misconfigured, this causes connection starvation on the database.

To prevent database saturation, Bastion enforces strict pool limits per serverless instance:

| Variable Name | Production Value | Purpose |
| :--- | :---: | :--- |
| `pool_min_size` | **1** | Retains a single connection warm to avoid cold start execution latency. |
| `pool_max_size` | **2** | Hard cap on database handles. Prevents Vercel scaling from exceeding cluster limits. |
| `max_idle_seconds`| **300** | Clears connections if inactive to prevent idle handle bloat. |

---

## 📦 Docker Compose Local Stack Setup

For local multi-worker testing, Bastion provides a `docker-compose.yml` to orchestrate a mock multi-instance topology:

```yaml
version: "3.8"

services:
  bastion-db:
    image: cockroachdb/cockroach:v23.1.0
    command: start-single-node --insecure
    ports:
      - "26257:26257"
      - "8080:8080"

  bastion-mcp:
    build: .
    environment:
      - BASTION_CONN=postgresql://root@bastion-db:26257/defaultdb?sslmode=disable
      - BASTION_MOCK=false
      - BASTION_LLM_GUARD=true
    ports:
      - "8000:8000"
    depends_on:
      - bastion-db
```

Run the local compose stack:
```bash
docker compose up --build
```

---

## ⚡ AWS Lambda Ingestion Configs

Our CDC Changefeed worker executes on AWS Lambda to parse updates out-of-band:
*   **Trigger:** CockroachDB `EXPERIMENTAL CHANGEFEED` pushing row mutations to an AWS Lambda API endpoint.
*   **Pool Isolation:** The Lambda handler does not share connection pools with our FastAPI A2A engine, guaranteeing that data cleanup and auditing calculations do not block user-facing SDK calls.
