import { safeQuery, isMockMode } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { apiSuccess, apiError } from "@/lib/api-response";

const defaultData = {
  isolation_level: "unknown",
  read_committed_enabled: false,
  repeatable_read_enabled: false,
};

export async function GET(request: Request) {
  const hasUserConn = !!request.headers.get("x-bastion-conn");
  if (!hasUserConn) {
    const authError = requireAuth(request);
    if (authError) return authError;

    if (isMockMode()) {
      return apiSuccess(defaultData, "short", { mock: true });
    }
  }

  try {
    const [isoRes, rcRes, rrRes] = await Promise.all([
      safeQuery("SHOW default_transaction_isolation"),
      safeQuery("SHOW CLUSTER SETTING sql.txn.read_committed_isolation.enabled").catch(() => ({
        rows: [{ value: "false" }],
      })),
      safeQuery("SHOW CLUSTER SETTING sql.txn.repeatable_read_isolation.enabled").catch(() => ({
        rows: [{ value: "false" }],
      })),
    ]);

    const isolationLevel = isoRes.rows[0]?.default_transaction_isolation || "unknown";
    const rcVal = (rcRes.rows[0] as Record<string, unknown>)?.value ?? (rcRes.rows[0] as Record<string, unknown>)?.setting_value ?? "false";
    const rrVal = (rrRes.rows[0] as Record<string, unknown>)?.value ?? (rrRes.rows[0] as Record<string, unknown>)?.setting_value ?? "false";
    const rcEnabled = String(rcVal) === "true";
    const rrEnabled = String(rrVal) === "true";

    return apiSuccess({
      isolation_level: isolationLevel,
      read_committed_enabled: rcEnabled,
      repeatable_read_enabled: rrEnabled,
    });
  } catch (error) {
    if (hasUserConn) {
      return apiError(
        error instanceof Error ? `Connection rejected: ${error.message}` : "Connection rejected — check credentials",
        400,
        "CONNECTION_FAILED",
      );
    }
    return apiSuccess(defaultData, "short", { mock: false, db_error: true });
  }
}
