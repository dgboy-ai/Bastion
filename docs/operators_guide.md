# Bastion: Operator's & Troubleshooting Guide

This guide is your single source of truth for running, testing, and debugging the Bastion memory ledger, the Next.js dashboard, and the Copilot/Cline integrations.

---

## 1. The Startup Sequence

To run the full stack locally, you need to spin up the **Custom MCP Backend**, the **A2A Server**, and the **Next.js Dashboard**.

### Step 1: Start the Custom MCP Backend
This starts the FastMCP server on port 8005, loads your environment variables, and pre-warms the local embedding model in the background:
```bash
# From the project root (c:\projects\bastion)
python -m venv .venv
source .venv/bin/activate  # Or .venv\Scripts\activate on Windows
pip install -e ".[mcp,groq]"

# Run the FastMCP HTTP server
python -m bastion.mcp_server --transport http --port 8005
```
* **How to verify**: Look for these lines in the terminal logs:
  * `INFO:bastion-mcp:Local embedding model pre-warmed`
  * `INFO:bastion-mcp:Loaded 3 active API keys from agent_auth table`
  * `Uvicorn running on http://0.0.0.0:8005`

### Step 2: Start the Next.js Dashboard
This opens the observability dashboard on port 3000:
```bash
# In a new terminal
cd dashboard
npm install
npm run dev
```
* **How to verify**: Open `http://localhost:3000` in your browser. The landing page should display your active database memory count (retrieved dynamically from CockroachDB).

---

## 2. Connecting the IDE Clients (Copilot & Cline)

IDE clients act as the "brains" that call the MCP tools.

### 2.1 GitHub Copilot Chat
* **The Config File**: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json` (also mapped by Copilot's MCP config panel).
* **How to Force Reload**:
  1. Open VS Code settings.
  2. Search for "MCP".
  3. Toggle the "Enable MCP" checkbox off and on again, or **restart VS Code completely**. This forces Copilot to reload connection headers.
* **How to verify**: Type `/mcp` or ask Copilot: *"List your active MCP servers."* It should list `bastion-memory` and `cockroachdb-cloud`.

### 2.2 Cline
* **How to configure**: Open the Cline settings gear icon, check **"Always auto-approve read/write/MCP tools"**, and verify the servers are listed as green dots in the sidebar.

---

## 3. The Troubleshooting Playbook (Managing Errors)

Here is how to resolve the exact errors you will encounter during testing or recording:

### 3.1 The "PowerShell Script Approval / pwsh" Loop (Copilot Windows Bug)
* **What happens**: Copilot runs a search tool, gets the JSON response, saves it to a temp file (`content.json`), and attempts to run a Python/PowerShell command to read it, prompting you: *"Run pwsh command?"* or failing with shell syntax errors.
* **Why it happens**: This is a VS Code client integration bug on Windows. Copilot is trying to parse the JSON via the terminal instead of reading it natively.
* **How to manage it**:
  * **Option A**: Click **Allow** on the first execution. If it loops or hits a quoting syntax error, click **Skip**.
  * **Option B (Bypass Prompt)**: If Copilot is stuck trying to parse a search output, feed it this prompt to force it to bypass scripting:
    > *"Ignore the Python shell script execution. Just read the raw JSON response payload that the `memory_search` MCP tool returned from the database and output the step list directly in our chat."*

### 3.2 The "InvalidTextRepresentation: incorrect UUID length" Database Crash
* **What happens**: The Python server log prints a traceback ending with: `psycopg.errors.InvalidTextRepresentation: could not parse "120" as type uuid`.
* **Why it happens**: Copilot tried to call `memory_correct` but passed a plain number or text (like `"120"` or `"last"`) instead of a valid 36-character database UUID. CockroachDB strictly enforces types and rejects invalid UUID strings.
* **How to manage it**:
  * If updating or correcting a record, you must supply the exact UUID (e.g. `50c64bf8-025a-4ed3-8c57-7f81c3185621`) in the prompt.
  * If the LLM is confused, reset the conversation tab (start a new chat) to clear the memory, and run a clean prompt:
    > *"Run the `memory_store` tool (not memory_correct) on the `bastion-memory` server to store a new entry."*

### 3.3 The "Groq API 401 Unauthorized" Error
* **What happens**: Python terminal prints: `INFO:httpx:HTTP Request: POST https://api.groq.com/... "HTTP/1.1 401 Unauthorized"`.
* **Why it happens**: The `GROQ_API_KEY` defined in `.env.local` is invalid, expired, or has been revoked.
* **How to manage it**:
  1. Generate a new API key on your [Groq Console](https://console.groq.com/keys).
  2. Open `.env.local` and update the key: `GROQ_API_KEY=gsk_your_new_key_here`.
  3. Restart the `mcp_server.py` process to load the new key.

### 3.4 Rate Limits & Token Caps
* **What happens**: Cline or Copilot says "rate limit reached" or consumes too many tokens during multi-step reasoning.
* **How to manage it**:
  * Use the **`/compact`** slash command in Copilot to condense the conversation history and free up context window space.
  * Start a **new chat window** for every new task. This resets the context window, keeping LLM reasoning fast and token costs minimal.
