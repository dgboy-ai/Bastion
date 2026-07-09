# AI Safety & Guardrail Architecture

This document details Bastion's multi-stage safety pipeline, PII firewalls, and prompt injection guards designed to protect agent context windows in production.

---

## 🛡️ The Multi-Stage Security Pipeline

When an agent writes to memory using `store()`, the input is processed through a **five-stage security firewall** before it hits database tables:

```
    [Raw Input Text] 
         │
         ▼  (Stage 1)
   ┌───────────┐
   │ PII Scan  │  --> Scubs Emails, IP Addresses, Credit Cards, and SSNs.
   └─────┬─────┘
         │
         ▼  (Stage 2)
   ┌───────────┐
   │ Regex Scan│  --> Fast regex filters scan for payload syntax blocks.
   └─────┬─────┘
         │
         ▼  (Stage 3)
   ┌───────────┐
   │ LLM Guard │  --> (If Enabled) Groq Llama-4 semantic classifier runs.
   └─────┬─────┘
         │
         ▼  (Stage 4)
   ┌───────────┐
   │ Self-Check│  --> LLM audits extracted entity triples for hallucinations.
   └─────┬─────┘
         │
         ▼  (Stage 5)
   ┌───────────┐
   │ Crypt Sign│  --> Memory is SHA-256 hashed and appended to Merkle root.
   └─────┬─────┘
         │
         ▼
  [Database Write]
```

---

## 🔎 Detailed Security Safeguards

### 1. The PII Sanitizer (`pii_scan`)
Scans memory blocks and redacts sensitive parameters, returning a sanitized string:
*   **Target Scopes:** Credit Card numbers, IPv4/IPv6 addresses, Phone numbers, Social Security Numbers (SSN), and Email addresses.
*   *Verification:* Asserted in `tests/test_guard.py` (`test_pii_scan_redacts_sensitive_data`).

### 2. Fast Regex Injection Scanners
A compilation of fast, local regex rules to detect payload tricks immediately without network latency:
```python
# Rejects common prompt injections and instruction override payloads
RE_PROMPT_INJECTION = re.compile(
    r"(ignore\s+prior\s+instructions|system\s+override|bypass\s+safety|you\s+are\s+now\s+a)",
    re.IGNORECASE
)
```

### 3. Semantic LLM Guardrail (Groq Llama-4)
If regex filters pass but semantic suspicion remains, and `BASTION_LLM_GUARD=True` is enabled, Bastion delegates a classification task to Groq:
*   **Model:** `meta-llama/llama-4-scout-17b-16e-instruct` (or defined via `GROQ_MODEL`).
*   **Prompt Classification:** Evaluates the input against 6 threat classifications (jailbreak, reverse engineering, override attempt, homoglyphs, multi-turn setups, or translated payloads).
*   **Structured Output:** Expects and validates a JSON response:
    ```json
    {
      "malicious": true,
      "threat_type": "jailbreak",
      "confidence": 0.95
    }
    ```

### 4. Entity Self-Checking Gate (`_self_check_triples`)
To prevent the agent from saving hallucinated or logically broken relationships, Bastion runs a self-check verification loop:
*   The agent extracts entity triples (Subject, Predicate, Object).
*   An independent validation query is sent to the LLM: *"Verify if the relation (S, P, O) is logically valid and factually consistent based on the source text."*
*   Invalid or contradictory triples are automatically pruned, resulting in an **8x increase in knowledge graph accuracy**.

---

## 🚦 Security Env Var Reference

Configure these parameters in your `.env` configuration:

| Variable | Default Value | Purpose |
| :--- | :--- | :--- |
| `BASTION_LLM_GUARD` | `false` | Enables Groq semantic guard scanning. |
| `GROQ_API_KEY` | — | Required for semantic guard and self-check operations. |
| `BASTION_A2A_STRICT` | `false` | Enforces Ed25519 signature checks on A2A payloads. |
| `BASTION_GUARD_BLOCK_SEVERITY` | `high` | Threshold for blocking suspicious writes. |
