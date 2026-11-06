import { safeQuery } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { computeHmacHash } from "@/lib/hash-chain";

export const dynamic = "force-dynamic";

const SCAN_LIMIT = 10_000;

type MemoryMetadata = Record<string, unknown> | null;

function normalizeMetadata(value: unknown): MemoryMetadata {
  let parsed: unknown = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const meta = { ...(parsed as Record<string, unknown>) };
  delete meta._precomputed_embedding;
  delete meta._trust_level;
  delete meta._source_provenance;
  return meta;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: string) => {
        controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
      };

      try {
        send("[INFO] Initializing live memory ledger integrity check...");
        await new Promise(r => setTimeout(r, 200));

        send("[DB] Connecting to CockroachDB Cluster...");
        let isoLevel = "SERIALIZABLE";
        try {
          const isoRes = await safeQuery("SHOW default_transaction_isolation");
          isoLevel = (isoRes.rows[0]?.default_transaction_isolation as string) || "SERIALIZABLE";
        } catch (err) {
          send(`[ERROR] Could not read isolation level: ${errorMessage(err)}`);
        }
        send(`[DB] Connection established. Isolation level: ${isoLevel}.`);

        // 1. Real hash-chain verification: recompute each HMAC and check both
        //    the content hash and the previous_hash link for every scanned row.
        let chainPass = false;
        let total = 0;
        let verified = 0;
        let tampered = 0;
        let linkBreaks = 0;
        try {
          const res = await safeQuery(
            `SELECT agent_id, memory_id, content, metadata, previous_hash,
                    cryptographic_hash, created_at
             FROM agent_memory
             ORDER BY agent_id ASC, created_at ASC, memory_id ASC
             LIMIT ${SCAN_LIMIT}`,
          );
          total = res.rows.length;

          let currentAgent = "";
          let expectedPrev = "";
          let firstMismatch: string | null = null;

          for (const row of res.rows) {
            const agentId = String(row.agent_id ?? "");
            if (agentId !== currentAgent) {
              currentAgent = agentId;
              expectedPrev = "";
            }

            const storedPrev = row.previous_hash ? String(row.previous_hash) : "";
            const storedHash = row.cryptographic_hash ? String(row.cryptographic_hash) : "";
            const recomputed = computeHmacHash(
              String(row.content ?? ""),
              normalizeMetadata(row.metadata),
              storedPrev,
            );

            const linkOk = storedPrev === expectedPrev;
            const contentOk = recomputed === storedHash;
            if (linkOk && contentOk) {
              verified += 1;
            } else {
              if (!linkOk) linkBreaks += 1;
              if (!contentOk) tampered += 1;
              if (!firstMismatch) firstMismatch = String(row.memory_id ?? "unknown");
            }
            expectedPrev = storedHash;
          }

          const coverage = total > 0 ? Math.round((verified / total) * 100) : 0;
          send(
            `[VERIFY] Scanned ${total.toLocaleString()} rows. ` +
            `Verified ${verified.toLocaleString()} (${coverage}%), ` +
            `${tampered} tampered, ${linkBreaks} broken links.`,
          );
          if (firstMismatch) send(`[ERROR] First failing memory: ${firstMismatch}`);
          if (total === SCAN_LIMIT) {
            send(`[WARN] Scan capped at ${SCAN_LIMIT.toLocaleString()} newest-by-agent rows.`);
          }
          if (total > 0 && verified === total) {
            chainPass = true;
            send("[VERIFY] Hash chain validation: PASS.");
          } else if (total === 0) {
            send("[ERROR] Hash chain validation: FAIL (no memories found).");
          } else {
            send("[ERROR] Hash chain validation: FAIL.");
          }
        } catch (err) {
          send(`[ERROR] Hash chain scan failed: ${errorMessage(err)}`);
        }

        // 2. Row-Level Security: a policy must actually exist. Do not convert
        //    an unavailable check into a PASS.
        let rlsPass = false;
        try {
          const policyRes = await safeQuery("SHOW POLICIES ON agent_memory");
          if ((policyRes.rowCount ?? 0) > 0) {
            const policyName = String(
              policyRes.rows[0]?.policy_name ??
              policyRes.rows[0]?.name ??
              "agent_memory_isolation",
            );
            send(`[VERIFY] Policy '${policyName}' detected on 'agent_memory'.`);
            rlsPass = true;
          } else {
            send("[ERROR] No RLS policy detected on 'agent_memory'. Verification: FAIL.");
          }
        } catch (err) {
          send(`[ERROR] RLS verification unavailable: ${errorMessage(err)}`);
        }

        // 3. Append-only audit: verify no non-admin grantee has UPDATE/DELETE
        //    on agent_audit. Errors are reported as unverified, never PASS.
        let appendOnlyPass = false;
        try {
          let grants;
          try {
            grants = await safeQuery("SHOW GRANTS ON agent_audit");
          } catch {
            grants = await safeQuery("SHOW GRANTS ON TABLE agent_audit");
          }

          const dangerous = grants.rows.filter((row: any) => {
            const privilege = String(row.privilege_type ?? row.privilege ?? "").toUpperCase();
            const grantee = String(row.grantee ?? row.user ?? "").toLowerCase();
            const hasWrite = /(^|\b)(UPDATE|DELETE|ALL)(\b|$)/.test(privilege);
            const isAdmin = /^(admin|root)$/.test(grantee);
            return hasWrite && !isAdmin;
          });

          if (dangerous.length > 0) {
            const grantees = Array.from(new Set(dangerous.map((row: any) => String(row.grantee ?? row.user ?? "unknown"))));
            send(`[ERROR] agent_audit has UPDATE/DELETE grants for: ${grantees.join(", ")}. Verification: FAIL.`);
          } else {
            appendOnlyPass = true;
            send("[VERIFY] No non-admin UPDATE/DELETE grants found on 'agent_audit'. Verification: PASS.");
          }
        } catch (err) {
          send(`[ERROR] Append-only audit verification unavailable: ${errorMessage(err)}`);
        }

        if (chainPass && rlsPass && appendOnlyPass) {
          send("[SUCCESS] All checks completed. Bastion Ledger Integrity is SECURE.");
        } else {
          send("[ERROR] Integrity scan completed with one or more failed or unverified checks.");
        }
      } catch (err) {
        send(`[ERROR] Fatal error during scan: ${errorMessage(err)}`);
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    }
  });
}
