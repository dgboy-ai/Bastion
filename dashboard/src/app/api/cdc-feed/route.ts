import { NextResponse } from "next/server";
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { requireAuth } from "@/lib/api-auth";
import { apiError } from "@/lib/api-response";
import { s3Client } from "@/lib/s3-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = process.env.BASTION_S3_BUCKET || "bastion-memory-archives";
const PREFIX = "cdc-live/";

/**
 * GET /api/cdc-feed?limit=30&after=<seq>
 *
 * Returns events streamed by the CockroachDB CDC changefeed to AWS S3
 * (the `cdc-live/` prefix). The dashboard consumes this as its real-time
 * threat feed — the database pushes changes via CDC, we just read what it
 * wrote. No SELECT-polling of the source tables.
 *
 * Response shape:
 *   { success: true, data: { source: "cdc", events: [...], total } }
 */
export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));

  try {
    // 1. List the newest CDC NDJSON files (skip .RESOLVED markers)
    const list = await s3Client.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX })
    );

    const dataFiles = (list.Contents ?? [])
      .filter((o) => o.Key?.endsWith(".ndjson"))
      .sort((a, b) => String(b.LastModified).localeCompare(String(a.LastModified)));

    const events: unknown[] = [];
    const seen = new Set<string>();

    const parseRecords = (key: string, text: string) => {
      const table = key.includes("-agent_memory-") ? "agent_memory" : "agent_audit";
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line);
          const after = rec?.after;
          if (!after || typeof after !== "object") continue;

          let action = String(after.action ?? "memory_changed");
          if (table === "agent_memory") {
            // agent_memory has no action column — derive from memory_type so the
            // dashboard can render poison_attempt/healed rows as BLOCKED/HEALED.
            const memoryType = String(after.memory_type ?? "memory_changed");
            if (memoryType === "poison_attempt") action = "poison_attempt_blocked";
            else if (memoryType === "healed") action = "healed";
            else if (memoryType === "security_incident") action = "security_incident";
            else action = "memory_changed";
          }

          const id = String(after.audit_id ?? after.memory_id ?? "");
          if (seen.has(id)) continue;
          seen.add(id);
          events.push({
            source: "cdc",
            kind: table === "agent_memory" ? "memory" : "audit",
            action,
            agentId: String(after.agent_id ?? "unknown"),
            id,
            details: after.details ?? null,
            memoryType: after.memory_type ?? null,
            recordedAt: String(
              after.recorded_at ?? after.created_at ?? new Date().toISOString()
            ),
          });
        } catch {
          // skip malformed line
        }
      }
    };

    // Read newest files concurrently. Skip oversized bulk-flush files
    // (> 500KB) unless we have nothing else — a live feed only needs the
    // recent small flushes.
    const fetchFile = async (key: string, size: number): Promise<boolean> => {
      if (size > 500_000) return false;
      try {
        const obj = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
        const text = await obj.Body?.transformToString();
        if (!text) return false;
        parseRecords(key, text);
        return true;
      } catch (err) {
        console.error("[api/cdc-feed] Read failed for", key, err instanceof Error ? err.message : "err");
        return false;
      }
    };

    const candidates = dataFiles.filter((o) => (o.Size ?? 0) <= 500_000).slice(0, 5);
    await Promise.all(candidates.map((o) => fetchFile(o.Key as string, o.Size ?? 0)));

    // If only oversized bulk files exist, read the single newest one anyway.
    if (events.length === 0 && dataFiles.length > 0) {
      const fallback = dataFiles[0];
      const obj = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: fallback.Key as string }));
      const text = await obj.Body?.transformToString();
      if (text) parseRecords(fallback.Key as string, text);
    }

    // Newest first
    events.reverse();
    if (events.length > limit) events.length = limit;

    return NextResponse.json({
      success: true,
      data: {
        source: "cdc",
        bucket: BUCKET,
        prefix: PREFIX,
        events,
        total: events.length,
      },
    });
  } catch (err) {
    console.error("[api/cdc-feed] failed:", err instanceof Error ? err.message : "Unknown error");
    return apiError("CDC feed unavailable", 503, "CDC_ERROR");
  }
}
