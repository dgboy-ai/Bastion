# Bastion — AGENTS.md

## Project
CRDB-native agentic memory platform. Win 1st place ($5,000) in CockroachDB × AWS Hackathon. Deadline: Aug 18, 2026 @ 5pm ET.

## Stack
Python 3.13.11, Node 24.14.0, npm 11.9.0, psycopg3, CockroachDB Serverless v25.4

## Key Files
- `BASTION.md` — identity, 7 locks, competitive analysis
- `TECHNICAL_SPEC.md` — architecture, data model, 5-week build plan
- `DEMO_SCRIPT.md` — 3-min demo script
- `SUBMISSION_CHECKLIST.md` — 16 claims with evidence
- `src/bastion/memory.py` — BastionMemory class (16 public methods)
- `src/bastion/mock.py` — in-memory mock backend
- `src/bastion/models.py` — 5 typed dataclasses
- `schema/001-004.sql` — CRDB schema
- `tests/test_mock_memory.py` — 20 pytest tests
- `docs/INTEGRATION.md` — framework adapter guide

## CRDB Cluster
- Name: `bastion-memory`
- Region: AWS ap-south-1 (Mumbai)
- URL: https://cockroachlabs.cloud/cluster/21aba470-cd4d-4e98-998c-e75bbcdabb98/overview

## Status
- Week 1: 7/8 (embedding pipeline deferred — needs AWS)
- Week 2: 4/7 (CDC Lambda, snapshot, circuit breaker deferred — needs AWS)
- 20 tests, 0 lint errors, real cluster verified e2e

## Commands
- `python -m pytest tests/ -v` — run tests
- `python -m ruff check src/ tests/` — lint
- `python scripts/apply_schema.py "$BASTION_CONN" schema` — apply schema
- `npm run build` — build TypeScript SDK (from sdk/typescript/)
