# AI Safety & Guardrail Architecture

This document details Bastion's multi-stage security pipeline, PII firewalls, and prompt injection guards designed to protect agent context windows in production.

---

## 🛡️ The Multi-Stage Security Pipeline

When an agent writes to memory using `store()`, the input is processed through a **seven-stage security firewall** before it hits database tables:

```
    [Raw Input Text] 
         │
         ▼  (Stage 1)
   ┌───────────┐
   │ Prompt    │  --> 9 regex patterns detect injection attempts
   │ Injection │      (ignore instructions, system override, admin override)
   │ Scan      │
   └─────┬─────┘
         │
         ▼  (Stage 2)
   ┌───────────┐
   │ Secret    │  --> 6 patterns detect API keys, private keys, AWS credentials
   │ Detection │      (sk/pk prefix, RSA/EC keys, GitHub tokens)
   └─────┬─────┘
         │
         ▼  (Stage 3)
   ┌───────────┐
   │ PII Scan  │  --> Redacts emails, phones, SSNs, credit cards, IPv4
   └─────┬─────┘
         │
         ▼  (Stage 4)
   ┌───────────┐
   │ LLM Guard │  --> (If Enabled) Groq Llama-4 semantic classifier
   └─────┬─────┘
         │
         ▼  (Stage 5)
   ┌───────────┐
   │ Content   │  --> Max content length check (100,000 chars)
   │ Size      │
   └─────┬─────┘
         │
         ▼  (Stage 6)
   ┌───────────┐
   │ Hash      │  --> SHA-256 verification of content + metadata
   │ Chain     │
   └─────┬─────┘
         │
         ▼  (Stage 7)
   ┌───────────┐
   │ Trust     │  --> Source provenance + trust level + age penalty
   │ Scoring   │
   └─────┬─────┘
         │
         ▼
  [Database Write]
```

---

## 🔎 Detailed Security Safeguards

### 1. Prompt Injection Detection (9 Patterns)

| Pattern | Severity | Example |
|---------|----------|---------|
| `ignore all previous instructions` | CRITICAL | Direct instruction override |
| `system: override/update/modify` | CRITICAL | System prompt manipulation |
| `admin override` | CRITICAL | Privilege escalation |
| `forget all previous` | HIGH | Memory wipe attempt |
| `you are (not) an AI/assistant` | HIGH | Identity override |
| `role-play as` | MEDIUM | Persona hijacking |
| `pretend to be` | MEDIUM | Social engineering |
| `DANGEROUS_(_[A-Z]+)+` | HIGH | Marker injection |
| `output only json/yaml/xml/raw` | LOW | Format override |

### 2. Secret Detection (6 Patterns)

| Pattern | Severity | Example |
|---------|----------|---------|
| 32+ char tokens | HIGH | Potential API key |
| `sk/pk/api` prefix | HIGH | Structured API key |
| RSA/EC/OPENSSH/PGP | CRITICAL | Private key material |
| `password/secret` in content | HIGH | Credential leakage |
| `aws_access_key_id` | CRITICAL | AWS credentials |
| `ghp/gho/ghu/ghs/ghr` | CRITICAL | GitHub tokens |

### 3. PII Detection & Redaction (5 Types)

| Type | Regex Pattern | Action |
|------|--------------|--------|
| Email | `[\w.-]+@[\w.-]+\.\w+` | Redact to `[EMAIL]` |
| Phone | `\+?[\d\s-]{10,}` | Redact to `[PHONE]` |
| SSN | `\d{3}-\d{2}-\d{4}` | Redact to `[SSN]` |
| Credit Card | `\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}` | Redact to `[CARD]` |
| IPv4 | `\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}` | Redact to `[IP]` |

### 4. Multi-Language Injection Detection

| Language | Patterns | Purpose |
|----------|----------|---------|
| Chinese | 5 patterns | Detect Mandarin injection attempts |
| Arabic | 3 patterns | Detect Arabic injection attempts |
| Portuguese | 3 patterns | Detect Portuguese injection attempts |

### 5. MCP Tool Manifest Scanner

Detects 9 malicious tool patterns (ClawHavoc defense):

| Pattern | Description |
|---------|-------------|
| Exfiltration | Tools that send data to external URLs |
| Credential theft | Tools that read env vars or keychains |
| Persona hijack | Tools that modify system prompts |
| Code execution | Tools that run arbitrary commands |
| Data destruction | Tools that delete files or databases |
| Privilege escalation | Tools that modify permissions |
| Backdoor installation | Tools that create persistent access |
| Network scanning | Tools that probe internal services |
| Crypto mining | Tools that consume excessive CPU |

### 6. Semantic LLM Guard (Groq Llama-4)

If regex filters pass but semantic suspicion remains, and `BASTION_LLM_GUARD=True` is enabled, Bastion delegates a classification task to Groq:

- **Model:** `meta-llama/llama-4-scout-17b-16e-instruct`
- **Prompt Classification:** Evaluates against 6 threat classifications
- **Structured Output:** JSON with malicious flag, threat type, confidence

```json
{
  "malicious": true,
  "threat_type": "jailbreak",
  "confidence": 0.95
}
```

### 7. Trust Scoring

| Source | Weight | Description |
|--------|--------|-------------|
| `system` | 1.0 | Internal system memories |
| `agent_direct` | 0.9 | Direct agent writes |
| `tool_verified` | 0.7 | Verified tool outputs |
| `tool_unverified` | 0.5 | Unverified tool outputs |
| `external_web` | 0.3 | External web content |
| `unknown` | 0.1 | Unknown sources |

**Age Penalties:**
- >90 days: 0.5x penalty
- >30 days: 0.7x penalty

---

## 🚦 Security Env Var Reference

| Variable | Default | Purpose |
|----------|---------|---------|
| `BASTION_LLM_GUARD` | `false` | Enables Groq semantic guard scanning |
| `GROQ_API_KEY` | — | Required for semantic guard |
| `BASTION_A2A_STRICT` | `false` | Enforces Ed25519 signature checks |
| `BASTION_GUARD_BLOCK_SEVERITY` | `high` | Threshold for blocking suspicious writes |

---

## 🛡️ Hash Chain Integrity

Every memory is cryptographically linked to its predecessor:

```
Hash_n = SHA256(Content + Metadata + Hash_{n-1})
```

**Verification:**
- Full chain: O(n) — verify every link
- Merkle proof: O(log n) — verify inclusion without full chain

**Detection:**
- Any out-of-band manipulation breaks the chain
- Alerts fire immediately on chain break
- CDC changefeed triggers self-healing

---

## 🔐 KMS Encryption

### Encryption Flow
1. Generate Data Encryption Key (DEK) via AWS KMS
2. Encrypt memory content with DEK (AES-256-GCM)
3. Store encrypted content + encrypted DEK in CockroachDB
4. Embed plaintext vector for search (zero-knowledge)
5. Decrypt on retrieval only

### Zero-Knowledge Search
- Database executes vector search on plaintext embeddings
- Stored content is encrypted ciphertext
- Database never sees plaintext during search
- Decryption happens only at the application layer

---

*This document satisfies the hackathon requirement for security and production readiness.*
