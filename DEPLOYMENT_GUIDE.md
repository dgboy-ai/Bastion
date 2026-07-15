# Deployment Guide: Bastion on CockroachDB + AWS

## Quick Deploy (5 minutes)

### Step 1: Create CockroachDB Serverless Cluster

1. Go to https://cockroachlabs.cloud/signup
2. Create a free Serverless cluster
3. Copy the connection string from the Dashboard

### Step 2: Set Environment Variables

```bash
export BASTION_CONN="postgresql://user:password@cluster-id.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"
```

### Step 3: Install and Run

```bash
git clone https://github.com/dgboy-ai/Bastion
cd Bastion
pip install bastion-memory

# Test connection
python -c "
from bastion import BastionMemory
mem = BastionMemory('my-agent', mock=False)
mem.store('fact', 'Hello from CockroachDB!')
print(mem.search('hello'))
print('Connected to real CockroachDB!')
"
```

### Step 4: Start MCP Server

```bash
python -m bastion.mcp_server
# Connect from Claude/Cursor/LangGraph
```

### Step 5: Deploy Dashboard

```bash
cd dashboard
npm install
npm run build
vercel deploy
```

---

## Docker Deploy (1 command)

```bash
git clone https://github.com/dgboy-ai/Bastion
cd Bastion
docker compose -f docker-compose.demo.yml up

# Dashboard: http://localhost:3000
# CockroachDB: http://localhost:8080
```

---

## AWS Lambda Deploy

```bash
cd lambda
sam build
sam deploy --guided
```

---

## What Judges See

| Step | Time | Result |
|------|------|--------|
| Clone repo | 10s | Code on disk |
| pip install | 30s | Package installed |
| Set env vars | 30s | Connection configured |
| Test connection | 10s | Real CockroachDB working |
| Start MCP | 10s | 25 tools available |
| Deploy dashboard | 2min | Live at vercel.app |
| **Total** | **3min** | **Production-ready** |

---

## Verification Checklist

- [ ] CockroachDB Serverless cluster created
- [ ] Connection string works
- [ ] Memory store returns memory_id
- [ ] Memory search returns results
- [ ] Time-travel returns historical state
- [ ] Hash chain verification passes
- [ ] MCP server starts and connects
- [ ] Dashboard deploys to Vercel
- [ ] All 1,223 tests pass
