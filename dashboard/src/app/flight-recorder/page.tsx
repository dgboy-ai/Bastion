import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import { safeQuery, isMockMode } from "@/lib/db";
import FlightRecorderContent from "./Content";

export const dynamic = "force-dynamic";

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

  return (
    <DashboardLayoutWrapper>
      <FlightRecorderContent initialEvents={events} initialTotal={total} />
    </DashboardLayoutWrapper>
  );
}
