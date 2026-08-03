import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import { safeQuery, isMockMode } from "@/lib/db";
import FlightRecorderContent from "./Content";

export const dynamic = "force-dynamic";

interface CaptureRow {
  id: string;
  agent_id: string;
  type: string;
  content: string;
  tool?: string;
  args_keys?: string[];
  error_type?: string;
  role?: string;
  trust_level: number;
  importance_score: number;
  provenance: string;
  is_pinned: boolean;
  hash?: string;
  previous_hash?: string;
  created_at: string;
}

async function getCapturedMemories() {
  try {
    const res = await safeQuery(`
      SELECT memory_id, agent_id, memory_type, left(content, 1000) AS content,
             metadata::varchar(500) AS metadata, trust_level, importance_score,
             source_provenance, is_pinned, cryptographic_hash, previous_hash, created_at
      FROM agent_memory
      WHERE memory_type IN ('tool_execution', 'error_log', 'conversation', 'episodic', 'session_lifecycle')
      ORDER BY created_at DESC
      LIMIT 50
    `);
    const captures: CaptureRow[] = res.rows.map((row: Record<string, unknown>) => {
      let metadata: Record<string, unknown> = {};
      if (typeof row.metadata === "string") {
        try { metadata = JSON.parse(row.metadata); } catch {}
      } else if (row.metadata && typeof row.metadata === "object") {
        metadata = row.metadata as Record<string, unknown>;
      }
      return {
        id: String(row.memory_id),
        agent_id: String(row.agent_id),
        type: String(row.memory_type),
        content: String(row.content),
        tool: (metadata.tool_name as string) || (metadata.tool as string) || undefined,
        args_keys: Array.isArray(metadata.arguments_keys) ? metadata.arguments_keys : undefined,
        error_type: (metadata.error_type as string) || undefined,
        role: (metadata.role as string) || undefined,
        trust_level: Number(row.trust_level ?? 2),
        importance_score: Number(row.importance_score ?? 0),
        provenance: String(row.source_provenance || "agent_direct"),
        is_pinned: Boolean(row.is_pinned),
        hash: (row.cryptographic_hash as string) || undefined,
        previous_hash: (row.previous_hash as string) || undefined,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      };
    });
    return { captures, total: captures.length };
  } catch (err: any) {
    console.error("Failed to fetch captured memories:", err.message);
    return { captures: [], total: 0 };
  }
}

async function getAuditEvents() {
  try {
    const res = await safeQuery(`
      SELECT audit_id, agent_id, action, details, recorded_at
      FROM agent_audit
      ORDER BY recorded_at DESC 
      LIMIT 50
    `);
    const events = res.rows.map((row: Record<string, unknown>) => {
      // Parse details — could be JSONB object or string
      let detailsStr = "";
      let contentPreview = "audit entry";
      let hash = "";
      let prevHash = "";
      let trustLevel = 3;

      if (row.details) {
        let d: Record<string, unknown> = {};
        if (typeof row.details === "string") {
          detailsStr = row.details;
          contentPreview = row.details.slice(0, 200);
          try { d = JSON.parse(row.details); } catch {}
        } else if (typeof row.details === "object") {
          detailsStr = JSON.stringify(row.details, null, 2);
          d = row.details as Record<string, unknown>;
          contentPreview = String(d.content_preview || d.memory_type || d.action || "").slice(0, 200) || JSON.stringify(row.details).slice(0, 200);
        }
        hash = (d.hash || d.cryptographic_hash || d.current_hash || "") as string;
        prevHash = (d.previous_hash || "") as string;
        if (typeof d.trust_level === "number") {
          trustLevel = d.trust_level;
        } else if (typeof d.trust_score === "number") {
          trustLevel = Math.round(d.trust_score * 4);
        }
      }
      
      const trustScore = trustLevel / 4.0;

      return {
        id: String(row.audit_id),
        timestamp: row.recorded_at instanceof Date ? row.recorded_at.toISOString() : String(row.recorded_at || new Date().toISOString()),
        type: String(row.action || "audit_check"),
        agent_id: String(row.agent_id || "unknown"),
        content_preview: contentPreview,
        hash: hash || String(row.audit_id || "").slice(0, 16),
        previous_hash: prevHash || undefined,
        trust_score: trustScore,
        status: "success",
        details: detailsStr,
      };
    });
    return { events, total: events.length };
  } catch (err: any) {
    console.error("Failed to fetch audit events:", err.message);
    return { events: [], total: 0 };
  }
}

export default async function FlightRecorderPage() {
  const { events, total } = await getAuditEvents();
  const { captures, total: capturesTotal } = await getCapturedMemories();

  return (
    <DashboardLayoutWrapper>
      <FlightRecorderContent
        initialEvents={events}
        initialTotal={total}
        initialCaptures={captures}
        initialCapturesTotal={capturesTotal}
      />
    </DashboardLayoutWrapper>
  );
}
