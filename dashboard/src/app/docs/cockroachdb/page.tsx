"use client";

const C = { gold: "#ffc800", lava: "#ff2a00", magma: "#ff9c00", cyan: "#00e5ff", body: "#e8e2ec", mute: "#8a8290" };

export default function CockroachDBPage() {
  return (
    <div style={{ maxWidth: "740px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: C.gold, textTransform: "uppercase", letterSpacing: "3px", fontWeight: 700, marginBottom: "12px" }}>Database Layer</div>
      <h1 style={{ fontSize: "clamp(32px,4vw,48px)", fontWeight: 900, color: "#fff", fontFamily: "var(--font-sg)", margin: "0 0 24px", lineHeight: 1.1 }}>
        <span style={{ color: C.gold }}>CockroachDB</span> Features
      </h1>

      <div style={{ fontSize: "16px", lineHeight: 1.8, color: C.body, fontFamily: "var(--font-inter)" }}>
        <p style={{ marginBottom: "20px" }}>
          Bastion uses CockroachDB as its distributed SQL backbone. Every memory operation — store, search, audit, time-travel — runs against CockroachDB with <strong style={{ color: "#fff" }}>SERIALIZABLE isolation</strong>.
        </p>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Why CockroachDB?</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", margin: "20px 0" }}>
          {[
            { t: "SERIALIZABLE Isolation", d: "CockroachDB uses SERIALIZABLE by default — the strictest isolation level. No phantom reads, no write-write conflicts between concurrent agents. This is critical when multiple agents write to the same memory store.", c: C.gold },
            { t: "AS OF SYSTEM TIME", d: "Point-in-time queries via MVCC. Query exactly what an agent knew at any timestamp without maintaining separate snapshots. Zero-copy reads.", c: C.cyan },
            { t: "C-SPANN Vector Index", d: "Distributed vector similarity search for memory embeddings. Sub-linear query time at scale. Used by memory_search and multi_signal_search.", c: C.magma },
            { t: "PostgreSQL Wire Protocol", d: "100% compatible with psycopg2, pg drivers, and ORMs. No vendor lock-in — switch to any Postgres-compatible database.", c: C.gold },
            { t: "CDC Changefeeds", d: "Change data capture for real-time event streaming. Powers the dashboard's live event feed and A2A push notifications.", c: C.cyan },
            { t: "Multi-Region Ready", d: "Schema uses REGIONAL BY ROW locality. Deploy to multiple regions with automatic failover when ready.", c: C.magma },
          ].map((f, i) => (
            <div key={i} style={{ padding: "16px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: "8px" }}>
              <div style={{ fontSize: "15px", fontWeight: 700, color: f.c, fontFamily: "var(--font-sg)", marginBottom: "4px" }}>{f.t}</div>
              <div style={{ fontSize: "13px", color: C.mute, lineHeight: 1.5 }}>{f.d}</div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Query Examples</h2>

        <div style={{ background: "#0a0608", border: "1px solid rgba(255,170,0,.12)", borderRadius: "8px", padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: "12px", color: "#d0c8d4", lineHeight: 1.6, margin: "16px 0" }}>
          <span style={{ color: C.mute }}>-- Time-travel query</span>{"\n"}
          <span style={{ color: C.cyan }}>SELECT</span> * <span style={{ color: C.cyan }}>FROM</span> agent_memory{"\n"}
          <span style={{ color: C.cyan }}>AS OF SYSTEM TIME</span> <span style={{ color: C.gold }}>'2026-01-15T12:00:00Z'</span>{"\n"}
          <span style={{ color: C.cyan }}>WHERE</span> agent_id = <span style={{ color: C.gold }}>$1</span>;{"\n\n"}
          <span style={{ color: C.mute }}>-- Vector similarity search</span>{"\n"}
          <span style={{ color: C.cyan }}>SELECT</span> content, embedding <span style={{ color: C.cyan }}> cosine_distance</span>(embedding, $1) <span style={{ color: C.cyan }}>AS</span> dist{"\n"}
          <span style={{ color: C.cyan }}>FROM</span> agent_memory{"\n"}
          <span style={{ color: C.cyan }}>ORDER BY</span> dist <span style={{ color: C.cyan }}>ASC LIMIT</span> 10;{"\n\n"}
          <span style={{ color: C.mute }}>-- Hash chain verification</span>{"\n"}
          <span style={{ color: C.cyan }}>SELECT</span> memory_id, cryptographic_hash{"\n"}
          <span style={{ color: C.cyan }}>FROM</span> agent_audit{"\n"}
          <span style={{ color: C.cyan }}>WHERE</span> action = <span style={{ color: C.gold }}>'memory_store'</span>{"\n"}
          <span style={{ color: C.cyan }}>ORDER BY</span> recorded_at <span style={{ color: C.cyan }}>DESC</span>;
        </div>
      </div>
    </div>
  );
}
