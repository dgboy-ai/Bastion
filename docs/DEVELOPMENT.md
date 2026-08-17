# Local Development & Setup Guide

This document details the onboarding workflow, database migrations, and configuration parameters for developers working on the Bastion library.

---

## ⚡ Quick Start: Zero-Config Mock Mode

To build and test agents locally without setting up a database or cloud keys, run Bastion in **Mock Mode**:

1.  **Configure environment:**
    ```bash
    # Set BASTION_MOCK to true to bypass database requirements
    export BASTION_MOCK="true"
    ```
2.  **Initialize Client:**
    ```python
    from bastion import BastionMemory

    # The client automatically falls back to local in-memory semaphores and LocalKMS
    mem = BastionMemory(agent_id="my-local-agent", mock=True)
    ```

---

## 🛢️ Distributed Mode Setup (CockroachDB)

To configure Bastion against a running CockroachDB instance:

1.  **Supply your connection parameters:**
    ```bash
    export BASTION_MOCK="false"
    export BASTION_CONN="postgresql://user:pass@host:26257/defaultdb?sslmode=verify-full"
    ```
2.  **Execute database migrations:**
    Run the migrations runner to verify and populate all tables, vector indices, and concurrency lock slots:
    ```bash
    python scripts/run_remaining_migrations.py
    ```
3.  **Run tests to verify:**
    ```bash
    python -m pytest tests/test_crdb_integration.py
    ```

---

## 🔌 Running the MCP Server Locally

To inspect the tools, resources, and prompts exposed by our Model Context Protocol (MCP) server, boot the server locally using stdio or SSE:

```bash
# Boot the MCP server on stdio transport
python -m bastion.mcp_server
```

---

## 🚦 Configuration Parameters Reference

Set these variables in your local `.env` configuration:

| Environment Variable | Default Value | Purpose |
| :--- | :---: | :--- |
| `BASTION_MOCK` | `true` | Runs the SDK in offline, mocked mock-mode. |
| `BASTION_CONN` | — | Connection string to your CockroachDB cluster. |
| `BASTION_AWS_KMS_KEY_ARN` | — | Target AWS KMS key ARN for envelope encryption. |
| `BASTION_LLM_GUARD` | `false` | Enables Groq semantic guard scanning. |
| `GROQ_API_KEY` | — | API key for LLM validation guards. |
