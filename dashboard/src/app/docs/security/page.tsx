"use client";

import Link from "next/link";
import { D } from "@/components/docs/theme";
import { PageHeader } from "@/components/docs/PageHeader";
import { FeatureCard } from "@/components/docs/FeatureCard";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { NextPrev } from "@/components/docs/NextPrev";

export default function SecurityPage() {
  return (
    <div style={{ maxWidth: "780px" }}>
      <PageHeader
        eyebrow="Defense in Depth"
        title={<><span style={{ color: D.lava }}>Security</span> Architecture</>}
        accent={D.lava}
      />

      <div style={{ fontSize: "16px", lineHeight: 1.8, color: D.body, fontFamily: "var(--font-inter)" }}>
        <p style={{ marginBottom: "20px" }}>
          Bastion implements <strong style={{ color: "#fff" }}>defense in depth</strong> — multiple overlapping security layers that protect agent memory from injection, poisoning, and tampering.
        </p>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>OWASP ASI06 MemoryGuard</h2>
        <p style={{ marginBottom: "12px" }}>Every memory write passes through a 7-stage security pipeline before reaching the database:</p>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "20px 0" }}>
          {[
            { n: "1", t: "Prompt Injection Scan", d: "Regex-based detection of 9+ injection patterns", c: D.lava },
            { n: "2", t: "Secret Detection", d: "API keys, tokens, passwords — 6 pattern types", c: D.lava },
            { n: "3", t: "PII Detection", d: "SSN, email, phone, credit card, IP address", c: D.gold },
            { n: "4", t: "Content Size Check", d: "Blocks abnormally large payloads", c: D.gold },
            { n: "5", t: "Hash Integrity", d: "Verifies hash chain hasn't been corrupted", c: D.cyan },
            { n: "6", t: "Trust Scoring", d: "Computes trust level based on source and content", c: D.cyan },
            { n: "7", t: "Safety Determination", d: "Final pass/fail based on aggregate findings", c: D.magma },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "10px 14px", background: D.card, border: `1px solid ${D.border}`, borderRadius: "6px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: `${s.c}15`, border: `1px solid ${s.c}30`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "11px", color: s.c, fontWeight: 700, flexShrink: 0 }}>{s.n}</div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)" }}>{s.t}</div>
                <div style={{ fontSize: "12px", color: D.mute }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Cryptographic Integrity</h2>
        <p style={{ marginBottom: "12px" }}>Every memory block is sealed with a SHA-256 hash chain:</p>
        <CodeBlock code={`# Each memory stores:
cryptographic_hash = SHA-256(content + previous_hash)
previous_hash      = SHA-256 of the last block

# If any record is modified:
# Hash chain breaks → detected by memory_audit`} lang="python" />

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>A2A Trust Protocol</h2>
        <p style={{ marginBottom: "12px" }}>Agent-to-agent communication uses Ed25519 cryptographic signing:</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "20px 0" }}>
          {[
            { t: "Ed25519 Agent Cards", d: "Each agent's card is cryptographically signed with its private key" },
            { t: "Signature Verification", d: "Receiving agents fetch sender's public key and verify the signature" },
            { t: "SSRF Protection", d: "Sender URLs validated against private/internal IP ranges" },
            { t: "Key Caching", d: "Public keys cached for 24 hours with LRU eviction (max 100)" },
          ].map((f, i) => (
            <FeatureCard key={i} title={f.t} description={f.d} color={D.cyan} />
          ))}
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Production Security</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", margin: "20px 0" }} className="sec-grid">
          {[
            { t: "Brute-Force Protection", d: "10 failures in 10min → 5min lockout. DB-backed + in-memory LRU." },
            { t: "Rate Limiting", d: "600 req/min/IP on A2A. 20 concurrent + 200 queue on MCP." },
            { t: "Request Timeout", d: "60s timeout on all endpoints. Prevents indefinite blocking." },
            { t: "RBAC", d: "3 roles (reader/writer/admin) with skill-level access control." },
          ].map((f, i) => (
            <div key={i} style={{ padding: "12px 14px", background: D.card, border: `1px solid ${D.border}`, borderRadius: "6px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)" }}>{f.t}</div>
              <div style={{ fontSize: "12px", color: D.mute, marginTop: "4px" }}>{f.d}</div>
            </div>
          ))}
        </div>

        {/* Cross-links */}
        <div style={{ marginTop: "32px", padding: "20px", background: "rgba(255,42,0,.06)", border: `1px solid ${D.lava}30`, borderRadius: "8px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "8px", fontFamily: "var(--font-sg)" }}>Related</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Link href="/docs/memory-architecture" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Memory System (Forensic Tier)</Link>
            <Link href="/docs/architecture" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Database Architecture</Link>
            <Link href="/docs/configuration" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Guard Configuration</Link>
          </div>
        </div>
      </div>

      <NextPrev pathname="/docs/security" />
      <style>{`.sec-grid { grid-template-columns: 1fr 1fr; } @media(max-width:560px){ .sec-grid { grid-template-columns: 1fr; } }`}</style>
    </div>
  );
}
