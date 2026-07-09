# Judge's Evaluation Walkthrough

Welcome, Hackathon Judges! This document provides a step-by-step technical guide to evaluate Bastion against the scoring criteria.

---

## 🧭 Evaluation Tracks

Bastion is designed to be evaluated across **three core tracks**:

```
      ┌─────────────────────────┐
      │    EVALUATION TRACKS    │
      └────────────┬────────────┘
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼
    ┌─────────┐┌─────────┐┌─────────┐
    │ Database││Security ││ Server  │
    │  Track  ││  Track  ││  Track  │
    └─────────┘└─────────┘└─────────┘
```

---

## 💾 1. Database & Consistency Track

This track verifies how we leverage CockroachDB's distributed properties.

### A. Slot-Based Concurrency Limiter
We use transactional row-locking to enforce limits across multiple independent instances.
*   **Code Reference:** [`src/bastion/limiter.py`](file:///c:/projects/bastion/src/bastion/limiter.py#L188-L215)
*   **What to check:** Note the `SELECT slot_id ... FOR UPDATE` query. This acquires slot rows atomically.
*   **How to test:** Run our concurrency test suite simulating parallel instance worker requests:
    ```bash
    python -m pytest tests/test_limiter.py
    ```

### B. Bi-Temporal Time-Travel
We query historical snapshots directly using CockroachDB's MVCC.
*   **Code Reference:** [`src/bastion/memory.py`](file:///c:/projects/bastion/src/bastion/memory.py#L525-L555)
*   **What to check:** Note the `AS OF SYSTEM TIME` query template.

---

## 🔒 2. Security & Compliance Track

This track verifies our AI safety firewalls and regulatory compliance mechanisms.

### A. Merkle Hash Audit Chains
Every memory record is cryptographically linked to detect database tempering.
*   **Code Reference:** [`src/bastion/audit.py`](file:///c:/projects/bastion/src/bastion/audit.py)
*   **What to check:** Note the hash linkage logic: `Hash_n = SHA256(Content + Metadata + Hash_n-1)`.
*   **How to test:** Run the audit verification tests:
    ```bash
    python -m pytest tests/test_compliance.py
    ```

### B. GDPR Verifiable Purging & Signed Receipts
We execute hard SQL deletes and return cryptographically signed erasure certificates.
*   **Code Reference:** [`src/bastion/compliance.py`](file:///c:/projects/bastion/src/bastion/compliance.py#L140-L185)
*   **What to check:** Note the Ed25519 signature validation on the JSON receipt output.

---

## 🌐 3. Server & AWS Integration Track

This track verifies our external communication APIs and serverless parameters.

### A. Model Context Protocol (MCP) Server
We run a FastMCP server that exposes memory operations directly to AI clients.
*   **Code Reference:** [`src/bastion/mcp_server.py`](file:///c:/projects/bastion/src/bastion/mcp_server.py)
*   **Prompts, Tools, and Resources:** The server exposes 14 tools, resources like `bastion://schema`, and prompts like `analyze_memory`.

### B. Agent-to-Agent (A2A) Identity Protocol
We implement the Google A2A protocol utilizing cryptographic Agent Cards and Ed25519 signature checks.
*   **Code Reference:** [`src/bastion/a2a_server.py`](file:///c:/projects/bastion/src/bastion/a2a_server.py#L350-L400)
*   **What to check:** Note the public key retrieval from the sender's `.well-known/agent-card.json` directory.
