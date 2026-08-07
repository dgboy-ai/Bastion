# Bastion: 3-Minute Demo Video Guide & Script

Use this screenplay to record your submission video. It is designed to fit exactly under the 3-minute mark, showcase every core feature, highlight your unique CockroachDB advantages, and prevent runtime errors.

---

## 🎬 Screen Setup & Preparation
1. **Left Window**: VS Code displaying the [agent_app.py](file:///c:/projects/bastion/agent_app.py) or `cline_mcp_settings.json` file.
2. **Right Window**: Web browser open to your Bastion Playground (`http://localhost:3000/playground` or `/flight-recorder`).

---

## ⏱️ Video Timeline & Script

### 0:00 - 0:45 | The Pitch: Why Agentic Memory Fails in Production
* **Visual**: Show your face or zoom in on the **Next.js Dashboard Landing Page** displaying active nodes.
* **Narration**:
  > *"AI agents are moving into production workflows—writing code, routing payments, and running infrastructure. But agents need memory that never goes down. Traditional databases were optimized for human scale. If an autonomous agent's memory goes offline or reads inconsistent data, it doesn't degrade gracefully—it crashes or loops, compounding errors.*
  >
  > *Furthermore, agents are highly vulnerable to **Memory Poisoning (OWASP ASI06)**. If an agent reads a malicious prompt, it writes the exploit to its long-term memory, permanently hijacking its future thoughts.
  >
  > *Meet **Bastion**—the first secure, tamper-evident, and self-healing persistent memory vault for AI agents, built on CockroachDB and AWS."*

---

### 0:45 - 1:30 | The Five Memory Forms & Serializable Safety
* **Visual**: Click on the **Playground** tab. Trigger a new task step. Watch the **D3.js Graph** render new nodes linked by green arrows in real-time.
* **Narration**:
  > *"Bastion does not treat memory as a simple string cache. It structures memory into five forms: conversation history, user context, task checkpoints, vector embeddings, and relational entity graphs—all stored natively in a single CockroachDB cluster.
  >
  > *We enforce **SERIALIZABLE transaction isolation** on all writes. As Rob Reid highlighted, agents execute asynchronously at superhuman speeds. Without serializable isolation, concurrent writes lead to race conditions, and agents consume corrupted state. Bastion's connection engine guarantees zero-data-loss consistency under high-frequency write concurrency."*

---

### 1:30 - 2:15 | The Poisoning Attack & Guard Block (The Climax)
* **Visual**: In the playground, trigger a **Poisoning Injection Simulation**. The dashboard **flashes red**, displaying a **Critical Threat Block** notification.
* **Narration**:
  > *"Here, we simulate an attacker attempting to inject a malicious prompt to hijack our agent's system instructions. Bastion's security guard interceptor scans the memory write, identifies the injection signature, blocks the transaction from hitting the database, and logs a forensic threat alert. The threat never reaches the agent's long-term memory."*

---

### 2:15 - 2:45 | Time-Travel & Self-Healing (How We Win)
* **Visual**: Simulate a database-level tampering event. Watch the hash chain arrows turn **red** showing a broken chain. 
* **Drag the Time-Travel Slider** back 30 seconds. Watch the nodes revert to green. Click **"Heal"**.
* **Narration**:
  > *"But what if an attacker bypasses the application layer and tampers with the database directly? Bastion stores all memories in a cryptographic SHA-256 hash chain. If a single byte is changed, the chain breaks.
  >
  > *Using CockroachDB's **AS OF SYSTEM TIME** primitives, our agent performs a temporal audit. We drag our time-travel slider back to a clean state, read the cryptographic checkpoint snapshot, and call `memory_heal()` to automatically reseal our ledger, restoring integrity instantly."*

---

### 2:45 - 3:00 | Conclusion & Architecture Summary
* **Visual**: Show the **Compliance/Locality** page showing GDPR regions.
* **Narration**:
  > *"With native Row-Level TTL for message expiration, C-SPANN distributed vector indexing, and AWS KMS envelope encryption, Bastion ensures agentic memory is secure, audit-proof, and always-on. 
  >
  > *Every other project builds memory FOR agents. Bastion builds memory that can PROVE ITSELF. Thank you."*

---

## 💡 Operator Pro-Tips for Recording:
* **No Live Typing**: Do not type prompts live during the video. Click the pre-configured buttons in the Next.js Playground to trigger the memory writes, attacks, and recoveries. This keeps the pacing fast and avoids typos.
* **Focus on the Red Flash**: Make sure the screen capture captures the dashboard turning red during the block—this is a high-impact visual that immediately tells the judges your security layer is alive and working.
* **Keep Uvicorn Terminal Visible**: If possible, keep your terminal visible in the corner showing the `INFO: POST /mcp 200 OK` logs flying by. This proves your local Python MCP server is actually processing the requests.
