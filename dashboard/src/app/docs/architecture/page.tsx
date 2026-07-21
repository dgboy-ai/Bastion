"use client";

const C = { gold: "#ffc800", lava: "#ff2a00", magma: "#ff9c00", cyan: "#00e5ff", body: "#e8e2ec", mute: "#8a8290" };

export default function ArchitecturePage() {
  return (
    <div style={{ maxWidth: "740px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: C.gold, textTransform: "uppercase", letterSpacing: "3px", fontWeight: 700, marginBottom: "12px" }}>System Design</div>
      <h1 style={{ fontSize: "clamp(32px,4vw,48px)", fontWeight: 900, color: "#fff", fontFamily: "var(--font-sg)", margin: "0 0 24px", lineHeight: 1.1 }}>
        Database <span style={{ color: C.gold }}>Architecture</span>
      </h1>

      <div style={{ fontSize: "16px", lineHeight: 1.8, color: C.body, fontFamily: "var(--font-inter)" }}>
        <p style={{ marginBottom: "20px" }}>
          At the core of Bastion is <strong style={{ color: "#fff" }}>CockroachDB</strong> — a distributed SQL database with SERIALIZABLE isolation, AS OF SYSTEM TIME queries, and C-SPANN vector indexing.
        </p>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Memory Ingestion Pipeline</h2>

        {/* Pipeline diagram */}
        <div style={{ background: "rgba(10,5,12,.7)", border: "1px solid rgba(255,170,0,.15)", borderRadius: "10px", padding: "28px", margin: "20px 0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
            {[
              { t: "Agent sends memory", c: C.cyan, bg: "rgba(0,229,255,.06)" },
              { t: "↓ OWASP ASI06 Guard (7-stage scan)", c: C.lava, bg: "transparent" },
              { t: "↓ AWS Bedrock Titan V2 (1024-dim embedding)", c: C.gold, bg: "rgba(255,200,0,.06)" },
              { t: "↓ SHA-256 Hash Chain (link to previous block)", c: C.magma, bg: "transparent" },
              { t: "↓ CockroachDB SERIALIZABLE commit", c: C.cyan, bg: "rgba(0,229,255,.06)" },
            ].map((s, i) => (
              <div key={i} style={{ padding: "10px 20px", border: `1px solid ${s.c}40`, borderRadius: "6px", background: s.bg, width: "100%", maxWidth: "400px", textAlign: "center", color: s.c }}>{s.t}</div>
            ))}
          </div>
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Schema</h2>
        <p style={{ marginBottom: "12px" }}>Bastion uses 3 core tables:</p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", margin: "20px 0" }}>
          {[
            { t: "agent_memory", d: "Main memory store with vector embeddings, hash chain, metadata, importance scores", c: C.gold },
            { t: "agent_audit", d: "Append-only audit log with SHA-256 hash chain entries", c: C.cyan },
            { t: "a2a_tasks", d: "A2A task persistence with CDC changefeed for push notifications", c: C.magma },
          ].map((t, i) => (
            <div key={i} style={{ padding: "14px 16px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: "8px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: t.c }}>{t.t}</div>
              <div style={{ fontSize: "13px", color: C.mute, marginTop: "4px" }}>{t.d}</div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Key CockroachDB Features Used</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "20px 0" }}>
          {[
            { t: "SERIALIZABLE Isolation", d: "Prevents write-write conflicts between concurrent agents. Default isolation level." },
            { t: "AS OF SYSTEM TIME", d: "Point-in-time queries for memory state at any timestamp. Zero-copy reads via MVCC." },
            { t: "C-SPANN Vector Index", d: "Distributed vector similarity search for memory embeddings." },
            { t: "PostgreSQL Wire Protocol", d: "Drop-in compatibility with psycopg2, pg drivers, and ORMs." },
            { t: "CDC Changefeeds", d: "Change data capture for real-time event streaming and push notifications." },
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", gap: "12px", padding: "12px 14px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: "6px" }}>
              <div style={{ width: "3px", borderRadius: "2px", background: C.gold, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)" }}>{f.t}</div>
                <div style={{ fontSize: "13px", color: C.mute, marginTop: "2px" }}>{f.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
