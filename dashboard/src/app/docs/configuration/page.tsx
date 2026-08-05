"use client";

import Link from "next/link";
import { D } from "@/components/docs/theme";
import { PageHeader } from "@/components/docs/PageHeader";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { NextPrev } from "@/components/docs/NextPrev";

function ConfigTable({ title, rows }: { title?: string; rows: [string, string, string, string][] }) {
  return (
    <div style={{ marginBottom: "32px" }}>
      {title && <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)", marginBottom: "12px" }}>{title}</h3>}
      <div style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${D.border}`, borderRadius: "8px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${D.border}` }}>
              {["Variable", "Default", "Required", "Description"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: "10px", color: D.mute, textTransform: "uppercase", letterSpacing: "1px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([v, d, r, p], i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <td style={{ padding: "8px 14px", fontFamily: "var(--font-mono)", fontSize: "12px", color: D.cyan }}>{v}</td>
                <td style={{ padding: "8px 14px", fontFamily: "var(--font-mono)", fontSize: "12px", color: D.mute }}>{d}</td>
                <td style={{ padding: "8px 14px", fontSize: "12px", color: r === "Yes" ? D.lava : D.mute }}>{r}</td>
                <td style={{ padding: "8px 14px", color: D.body }}>{p}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ConfigurationPage() {
  return (
    <div style={{ maxWidth: "820px" }}>
      <PageHeader
        eyebrow="Reference"
        title={<>Configuration <span style={{ color: D.gold }}>Reference</span></>}
      />

      <div style={{ fontSize: "16px", lineHeight: 1.8, color: D.body, fontFamily: "var(--font-inter)" }}>
        <p style={{ marginBottom: "20px" }}>
          Bastion is configured via environment variables and a <code style={{ fontSize: "13px", color: D.gold }}>.env.local</code> file. All variables use the <code style={{ fontSize: "13px", color: D.gold }}>BASTION_</code> prefix. Settings are loaded by <code style={{ fontSize: "13px", color: D.gold }}>pydantic-settings</code> with OS env vars taking highest priority.
        </p>

        <CodeBlock code={`# .env.local (gitignored — never commit real credentials)
BASTION_CONN="postgresql://user:pass@host:26257/bastion?sslmode=verify-full"
BASTION_API_KEY="bastion-your-api-key-here"
BASTION_MOCK=false`} lang="bash" />

        {/* ── Core ────────────────────────────────────────── */}
        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>Core Settings</h2>

        <ConfigTable title="Connection" rows={[
          ["BASTION_CONN", "—", "Yes", "CockroachDB PostgreSQL connection string (sslmode=verify-full)"],
          ["BASTION_MOCK", "false", "No", "Enable mock mode — no database required, in-memory storage only"],
          ["BASTION_API_KEY", "—", "Prod", "API key for MCP/A2A authentication. Disabled when empty."],
          ["BASTION_AGENT_ID", "bastion-a2a", "No", "Agent identity for A2A server"],
        ]} />

        <ConfigTable title="Embedding Pipeline" rows={[
          ["BASTION_EMBED_MODEL_ID", "BAAI/bge-large-en-v1.5", "No", "HuggingFace model ID for embedding generation"],
          ["BASTION_EMBED_DIM", "1024", "No", "Embedding dimensions (must match model output)"],
          ["HF_TOKEN", "—", "No", "HuggingFace API token for embedding API access"],
          ["BASTION_EMBED_READ_TIMEOUT", "30", "No", "Timeout (seconds) for embedding API reads"],
          ["BASTION_EMBED_CONNECT_TIMEOUT", "10", "No", "Timeout (seconds) for embedding API connections"],
        ]} />

        {/* ── Server ──────────────────────────────────────── */}
        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>Server Settings</h2>

        <ConfigTable title="MCP Server" rows={[
          ["BASTION_MCP_API_KEYS", "—", "No", "Comma-separated list of valid API keys (multi-key mode)"],
          ["BASTION_TRUST_PROXY", "false", "No", "Trust X-Forwarded-For headers (for reverse proxy deployments)"],
          ["BASTION_MCP_OAUTH_CLIENT_ID", "—", "No", "Pre-registered OAuth client ID for MCP auth"],
          ["BASTION_MCP_OAUTH_CLIENT_SECRET", "—", "No", "Pre-registered OAuth client secret"],
          ["BASTION_MCP_OAUTH_REDIRECT_URI", "—", "No", "OAuth redirect URI"],
        ]} />

        <ConfigTable title="A2A Server" rows={[
          ["A2A_PORT", "9998", "No", "A2A server listen port"],
          ["A2A_HOST", "0.0.0.0", "No", "A2A server bind address"],
          ["A2A_URL", "http://0.0.0.0:9998", "No", "Public A2A URL for agent card"],
          ["BASTION_A2A_PRIVATE_KEY", "—", "No", "Base64-encoded Ed25519 private key for agent card signing"],
          ["BASTION_A2A_STRICT", "true", "No", "Strict A2A auth mode (reject unsigned cards)"],
          ["BASTION_A2A_TRUSTED_KEYS", "—", "No", "Comma-separated SHA-256 fingerprints of trusted keys"],
          ["BASTION_A2A_ROLE", "admin", "No", "Default role for single-key mode"],
          ["BASTION_A2A_ROLES", "—", "No", "Per-key role mapping: key1:writer,key2:reader,default:admin"],
          ["A2A_CLEANUP_INTERVAL", "3600", "No", "Seconds between task cleanup cycles"],
          ["A2A_TASK_MAX_AGE", "86400", "No", "Max age (seconds) for completed tasks before cleanup"],
        ]} />

        <ConfigTable title="Bridge (MCP↔A2A)" rows={[
          ["BASTION_BRIDGE_ALLOW_LOOPBACK", "false", "No", "Allow bridge to forward to localhost (dev mode)"],
        ]} />

        {/* ── Connection Pool ──────────────────────────────── */}
        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>Connection Pool & Resilience</h2>

        <ConfigTable title="Pool Settings" rows={[
          ["BASTION_POOL_MIN_SIZE", "5", "No", "Minimum idle connections in pool"],
          ["BASTION_POOL_MAX_SIZE", "20", "No", "Maximum connections in pool"],
          ["BASTION_POOL_MAX_IDLE_SECONDS", "300", "No", "Max idle time before connection is closed"],
        ]} />

        <ConfigTable title="Circuit Breaker" rows={[
          ["BASTION_CIRCUIT_BREAKER_FAILURE_THRESHOLD", "5", "No", "Consecutive failures before circuit opens"],
          ["BASTION_CIRCUIT_BREAKER_RECOVERY_TIMEOUT", "30", "No", "Seconds before circuit tries half-open"],
          ["BASTION_CIRCUIT_BREAKER_SUCCESS_THRESHOLD", "2", "No", "Successes in half-open to close circuit"],
        ]} />

        <ConfigTable title="Retry" rows={[
          ["BASTION_RETRY_MAX_RETRIES", "5", "No", "Maximum retry attempts"],
          ["BASTION_RETRY_BASE_DELAY_MS", "10", "No", "Base delay (ms) for exponential backoff"],
          ["BASTION_RETRY_MAX_DELAY_MS", "2000", "No", "Maximum delay (ms) between retries"],
          ["BASTION_RETRY_JITTER_FACTOR", "0.5", "No", "Jitter factor to prevent thundering herd"],
        ]} />

        <ConfigTable title="Rate Limiter" rows={[
          ["BASTION_LIMITER_MAX_CONCURRENT", "10", "No", "Max concurrent requests"],
          ["BASTION_LIMITER_MAX_QUEUE", "100", "No", "Max queued requests when at capacity"],
          ["BASTION_LIMITER_TIMEOUT_SECONDS", "30", "No", "Seconds before queued request times out"],
        ]} />

        {/* ── Guard ──────────────────────────────────────── */}
        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>Guard (OWASP ASI06)</h2>

        <ConfigTable rows={[
          ["BASTION_GUARD_MAX_CONTENT", "100000", "No", "Max content length (chars) before block"],
          ["BASTION_GUARD_BLOCK_SEVERITY", "high", "No", "Minimum severity to block: low, medium, high, critical"],
          ["BASTION_LLM_GUARD", "false", "No", "Enable LLM-powered semantic classification (requires Groq)"],
          ["GROQ_API_KEY", "—", "Conditional", "Groq API key (required when BASTION_LLM_GUARD=true)"],
          ["GROQ_MODEL", "openai/gpt-oss-120b", "No", "Groq model for LLM guard classification"],
        ]} />

        {/* ── Search ──────────────────────────────────────── */}
        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>Search & Memory</h2>

        <ConfigTable rows={[
          ["BASTION_SEARCH_DEFAULT_K", "5", "No", "Default number of results for memory_search"],
          ["BASTION_SEARCH_DEFAULT_THRESHOLD", "0.8", "No", "Default similarity threshold (0-1)"],
          ["BASTION_CACHE_DEFAULT_THRESHOLD", "0.97", "No", "L1 cache promotion threshold"],
          ["BASTION_DECAY_RATE", "0.01", "No", "Cognitive decay rate for importance scores"],
          ["BASTION_REINFORCE_BOOST", "1.0", "No", "Importance boost when memory is accessed"],
        ]} />

        {/* ── KMS / Encryption ──────────────────────────────── */}
        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>Encryption (KMS)</h2>

        <ConfigTable rows={[
          ["BASTION_KMS_KEY", "—", "No", "Hex-encoded 256-bit key for local encryption"],
          ["BASTION_KMS_KEY_FILE", "—", "No", "Path to file containing hex-encoded key"],
          ["BASTION_KMS_GENERATE", "false", "No", "Auto-generate and persist a new key"],
          ["BASTION_AWS_KMS_KEY_ARN", "—", "No", "AWS KMS key ARN for CMEK encryption"],
          ["BASTION_GCP_KMS_RESOURCE", "—", "No", "GCP KMS resource name for CMEK"],
          ["AWS_REGION", "us-east-1", "No", "AWS region for KMS operations"],
        ]} />

        {/* ── Logging & Compliance ──────────────────────────── */}
        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>Logging & Compliance</h2>

        <ConfigTable rows={[
          ["BASTION_LOG_LEVEL", "INFO", "No", "Python log level: DEBUG, INFO, WARNING, ERROR, CRITICAL"],
          ["LOG_JSON", "false", "No", "Enable JSON structured logging"],
          ["BASTION_COMPLIANCE_MODE", "—", "No", "Compliance mode: e.g., 'eu_ai_act', 'soc2'"],
        ]} />

        {/* ── Storage ──────────────────────────────────────── */}
        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>Storage</h2>

        <ConfigTable rows={[
          ["BASTION_S3_BUCKET", "bastion-memory-archives", "No", "S3 bucket for memory archives"],
          ["BASTION_PROJECT_URL", "https://bastion-self.vercel.app", "No", "Project URL for agent card"],
          ["BASTION_DOCS_URL", "https://github.com/dgboy-ai/Bastion", "No", "Documentation URL for agent card"],
        ]} />

        {/* ── Query Limits ──────────────────────────────────── */}
        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>Query Limits</h2>

        <ConfigTable rows={[
          ["AUDIT_LIMIT", "100", "No", "Max rows returned by memory_audit"],
          ["ANOMALY_LIMIT", "50", "No", "Max rows returned by anomaly detection"],
          ["SEARCH_RESULT_LIMIT", "500", "No", "Max rows returned by search queries"],
          ["DBA_SLOW_QUERY_LIMIT", "10", "No", "Max slow queries returned by DBA tools"],
          ["LOCALITY_LIMIT", "10", "No", "Max rows for locality analysis"],
        ]} />

        {/* ── Example Configs ──────────────────────────────── */}
        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>Example Configurations</h2>

        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)", margin: "28px 0 12px" }}>Development (Mock Mode)</h3>
        <CodeBlock code={`# Minimal config — no database needed
BASTION_MOCK=true
BASTION_API_KEY=test-key`} lang="bash" />

        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)", margin: "28px 0 12px" }}>Production (CockroachDB)</h3>
        <CodeBlock code={`# Full production config
BASTION_CONN="postgresql://user:pass@your-cluster:26257/bastion?sslmode=verify-full"
BASTION_MOCK=false
BASTION_API_KEY="bastion-prod-api-key"
BASTION_A2A_PRIVATE_KEY="base64-encoded-ed25519-key"
BASTION_POOL_MAX_SIZE=20
BASTION_GUARD_BLOCK_SEVERITY=medium
BASTION_LOG_LEVEL=INFO`} lang="bash" />

        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)", margin: "28px 0 12px" }}>Docker</h3>
        <CodeBlock code={`# docker-compose.yml environment section
environment:
  BASTION_CONN: \${BASTION_CONN}
  BASTION_API_KEY: \${BASTION_API_KEY}
  BASTION_MOCK: "false"
  BASTION_POOL_MAX_SIZE: "20"`} lang="yaml" />

        {/* ── CTA ──────────────────────────────────────────── */}
        <div style={{
          marginTop: "48px",
          padding: "24px",
          background: "rgba(255,170,0,.06)",
          border: `1px solid ${D.borderGold}`,
          borderRadius: "10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)" }}>Ready to deploy?</div>
            <div style={{ fontSize: "13px", color: D.mute }}>Follow the Setup Guide for step-by-step deployment.</div>
          </div>
          <Link href="/docs/setup" style={{
            padding: "10px 24px",
            borderRadius: "6px",
            background: `linear-gradient(135deg,${D.lava},${D.magma})`,
            color: "#fff",
            fontSize: "13px",
            fontWeight: 800,
            textDecoration: "none",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}>
            Setup Guide →
          </Link>
        </div>
      </div>

      <NextPrev pathname="/docs/configuration" />
    </div>
  );
}
