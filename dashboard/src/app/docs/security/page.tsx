"use client";

const C = { gold: "#ffc800", lava: "#ff2a00", magma: "#ff9c00", cyan: "#00e5ff", body: "#e8e2ec", mute: "#8a8290" };

export default function SecurityPage() {
  return (
    <div style={{ maxWidth: "740px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: C.lava, textTransform: "uppercase", letterSpacing: "3px", fontWeight: 700, marginBottom: "12px" }}>Defense in Depth</div>
      <h1 style={{ fontSize: "clamp(32px,4vw,48px)", fontWeight: 900, color: "#fff", fontFamily: "var(--font-sg)", margin: "0 0 24px", lineHeight: 1.1 }}>
        <span style={{ color: C.lava }}>Security</span> Architecture
      </h1>

      <div style={{ fontSize: "16px", lineHeight: 1.8, color: C.body, fontFamily: "var(--font-inter)" }}>
        <p style={{ marginBottom: "20px" }}>
          Bastion implements <strong style={{ color: "#fff" }}>defense in depth</strong> — multiple overlapping security layers that protect agent memory from injection, poisoning, and tampering.
        </p>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>OWASP ASI06 MemoryGuard</h2>
        <p style={{ marginBottom: "12px" }}>Every memory write passes through a 7-stage security pipeline before reaching the database:</p>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "20px 0" }}>
          {[
            { n: "1", t: "Prompt Injection Scan", d: "Regex-based detection of 9+ injection patterns", c: C.lava },
            { n: "2", t: "Secret Detection", d: "API keys, tokens, passwords — 6 pattern types", c: C.lava },
            { n: "3", t: "PII Detection", d: "SSN, email, phone, credit card, IP address", c: C.gold },
            { n: "4", t: "Content Size Check", d: "Blocks abnormally large payloads", c: C.gold },
            { n: "5", t: "Hash Integrity", d: "Verifies hash chain hasn't been corrupted", c: C.cyan },
            { n: "6", t: "Trust Scoring", d: "Computes trust level based on source and content", c: C.cyan },
            { n: "7", t: "Safety Determination", d: "Final pass/fail based on aggregate findings", c: C.magma },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "10px 14px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: "6px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: `${s.c}15`, border: `1px solid ${s.c}30`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "11px", color: s.c, fontWeight: 700, flexShrink: 0 }}>{s.n}</div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)" }}>{s.t}</div>
                <div style={{ fontSize: "12px", color: C.mute }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Cryptographic Integrity</h2>
        <p style={{ marginBottom: "12px" }}>Every memory block is sealed with a SHA-256 hash chain:</p>
        <div style={{ background: "#0a0608", border: "1px solid rgba(255,170,0,.12)", borderRadius: "8px", padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: "12px", color: "#d0c8d4", lineHeight: 1.6, margin: "16px 0" }}>
          <span style={{ color: C.mute }}>// Each memory stores:</span>{"\n"}
          <span style={{ color: C.cyan }}>cryptographic_hash</span> = SHA-256(content + previous_hash){"\n"}
          <span style={{ color: C.cyan }}>previous_hash</span> = SHA-256 of the last block{"\n"}
          {"\n"}
          <span style={{ color: C.mute }}>// If any record is modified:</span>{"\n"}
          <span style={{ color: C.lava }}>// Hash chain breaks → detected by memory_audit</span>
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>A2A Trust Protocol</h2>
        <p style={{ marginBottom: "12px" }}>Agent-to-agent communication uses Ed25519 cryptographic signing:</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "20px 0" }}>
          {[
            { t: "Ed25519 Agent Cards", d: "Each agent's card is cryptographically signed with its private key" },
            { t: "Signature Verification", d: "Receiving agents fetch sender's public key and verify the signature" },
            { t: "SSRF Protection", d: "Sender URLs validated against private/internal IP ranges" },
            { t: "Key Caching", d: "Public keys cached for 24 hours with LRU eviction (max 100)" },
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", padding: "10px 14px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: "6px" }}>
              <div style={{ width: "3px", borderRadius: "2px", background: C.cyan, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)" }}>{f.t}</div>
                <div style={{ fontSize: "12px", color: C.mute, marginTop: "2px" }}>{f.d}</div>
              </div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Production Security</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", margin: "20px 0" }}>
          {[
            { t: "Brute-Force Protection", d: "10 failures in 10min → 5min lockout. DB-backed + in-memory LRU." },
            { t: "Rate Limiting", d: "600 req/min/IP on A2A. 20 concurrent + 200 queue on MCP." },
            { t: "Request Timeout", d: "60s timeout on all endpoints. Prevents indefinite blocking." },
            { t: "RBAC", d: "3 roles (reader/writer/admin) with skill-level access control." },
          ].map((f, i) => (
            <div key={i} style={{ padding: "12px 14px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: "6px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)" }}>{f.t}</div>
              <div style={{ fontSize: "12px", color: C.mute, marginTop: "4px" }}>{f.d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
