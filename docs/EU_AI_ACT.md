# EU AI Act Compliance — Article 12 & Article 50

## Overview

The **EU AI Act (Regulation EU 2024/1689)** entered partial enforcement on **2 August 2026**. Article 50 (transparency obligations) and Article 12 (record-keeping) require AI systems to provide automatic, tamper-evident logging of events throughout their lifecycle.

This document maps Bastion's features to specific EU AI Act requirements.

## Enforcement Timeline

| Date | Obligation | Status |
|------|------------|--------|
| **2 August 2026** | Transparency (Art 50) + Record-keeping (Art 12) | ✅ **ACTIVE** |
| 2 December 2026 | Prohibition of non-consensual intimate imagery | Future |
| 2 December 2027 | High-risk AI compliance (biometrics, infra, etc.) | Future |
| 2 August 2028 | High-risk AI in regulated products | Future |

## Article 12 — Record-Keeping Requirements

### What the Statute Says

> *"High-risk AI systems shall technically allow for the automatic recording of events (logs) over the lifetime of the system."* — Article 12(1)

> *"The logs shall be kept for a period appropriate to the intended purpose of the high-risk AI system, of at least six months."* — Articles 19, 26(6)

### Key Requirements

| Requirement | Bastion Feature | Implementation |
|---|---|---|
| **Automatic event recording** | `agent_audit` table | Every `store`, `search`, `delete`, `heal`, `correct` operation is logged automatically via `_audit()` |
| **Tamper-evident logs** | SHA-256 hash chain | Each audit entry linked to previous via `previous_hash` and `cryptographic_hash` in `agent_memory` |
| **Traceability** | Hash chain verification + `forensic_report` | `forensic_report` tool verifies chain integrity — detects any break |
| **6-month retention** | CockroachDB durable storage + TTL | `expires_at` column controls retention; no automatic deletion for audit data |
| **Post-market monitoring** | `memory_health` + `forensic_report` | Health stats and integrity checks available at any time |
| **Time-travel reconstruction** | `AS OF SYSTEM TIME` | Query memory state at any past moment via `memory_timetravel` tool |
| **Regulator query interface** | `memory_audit` MCP tool | Returns complete append-only audit trail for any agent |

## Article 50 — Transparency Obligations

### What the Statute Says

> *"Providers shall ensure that AI systems intended to interact with natural persons are designed and developed in such a way that the natural persons concerned are informed that they are interacting with an AI system."*

### How Bastion Supports Compliance

| Requirement | Bastion Feature |
|---|---|
| Disclosure of AI interaction | Audit trail records all agent interactions with timestamps and metadata |
| Content provenance | Hash chain provides cryptographic proof of content origin and history |
| Machine-readable labeling | Metadata in `agent_memory` supports provenance tracking |

## Compliance Mode

Set `compliance_mode=eu_ai_act` when initializing `BastionMemory` to enable:

- **Mandatory audit logging** on every memory operation
- **Hash chain verification** on every store
- **Minimum 6-month TTL** enforcement on compliance-relevant memories
- **Structured audit events** following IETF AAT format

### Usage

```python
from bastion.memory import BastionMemory

mem = BastionMemory(
    agent_id="my-agent",
    compliance_mode="eu_ai_act",
)
```

Or via environment:

```bash
export BASTION_COMPLIANCE_MODE=eu_ai_act
```

## Compliance Report

Generate a regulator-ready compliance report:

```python
from bastion.compliance import ComplianceReporter

reporter = ComplianceReporter(mem)
report = reporter.generate_report(
    agent_id="my-agent",
    start_date="2026-07-01T00:00:00Z",
    end_date="2026-07-29T00:00:00Z",
)
```

Or via the MCP tool:

```
compliance_report(start_date="2026-07-01T00:00:00Z")
```

## Technical Evidence

An auditor can verify compliance using:

1. **`forensic_report`** — proves hash chain integrity across all memories
2. **`memory_audit`** — returns append-only, tamper-evident audit trail
3. **`memory_timetravel`** — reconstructs system state at any past moment
4. **`compliance_report`** — structured Article 12 compliance evidence

## Penalties for Non-Compliance

- Up to **€15 million** or **3% of worldwide annual turnover**, whichever is higher

## References

- [EU AI Act Full Text](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
- [Article 12 — Record-Keeping](https://artificialintelligenceact.eu/article/12/)
- [EU AI Act Service Desk](https://ai-act-service-desk.ec.europa.eu)
- [Digital Omnibus on AI (July 2026)](https://www.consilium.europa.eu/en/press/press-releases/2026/06/29/artificial-intelligence-council-gives-final-green-light-to-simplify-and-streamline-rules/)
