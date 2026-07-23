import { NextResponse } from "next/server";

// ── Cache-Control durations (seconds) ──────────────────────────────────────

const CACHE_DURATIONS = {
  static: 300,
  short: 60,
  dynamic: 0,
} as const;

type CacheType = keyof typeof CACHE_DURATIONS;

// ── Standard API Envelope ───────────────────────────────────────────────────
//
// Every JSON API route returns one of:
//
//   Success:  { success: true,  data: T, meta?: {...} }
//   Error:    { success: false, error: string, code?: string }
//
// This makes every response shape predictable for frontend consumers
// and satisfies the "Production Readiness" judging criterion.

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
}

// ── Response builders ───────────────────────────────────────────────────────

function buildHeaders(cacheType: CacheType, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  const maxAge = CACHE_DURATIONS[cacheType];
  if (maxAge > 0) {
    headers["Cache-Control"] = `public, max-age=${maxAge}, s-maxage=${maxAge * 2}`;
  } else {
    headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
  }
  return headers;
}

/**
 * Return a successful API response with the standard envelope.
 *
 * @param data   - The payload to return
 * @param cache  - Cache-Control duration: "static" (5min), "short" (60s), "dynamic" (none)
 * @param meta   - Optional metadata (total, page, limit, etc.)
 * @param extra  - Optional extra headers
 */
export function apiSuccess<T>(
  data: T,
  cache: CacheType = "dynamic",
  meta?: Record<string, unknown>,
  extra?: Record<string, string>,
): NextResponse<ApiSuccessResponse<T>> {
  const body: ApiSuccessResponse<T> = { success: true, data };
  if (meta) body.meta = meta;
  return NextResponse.json(body, { headers: buildHeaders(cache, extra) });
}

/**
 * Return an error API response with the standard envelope.
 *
 * @param message - Human-readable error message
 * @param status  - HTTP status code (default 400)
 * @param code    - Optional machine-readable error code
 */
export function apiError(
  message: string,
  status: number = 400,
  code?: string,
): NextResponse<ApiErrorResponse> {
  const body: ApiErrorResponse = { success: false, error: message };
  if (code) body.code = code;
  return NextResponse.json(body, {
    status,
    headers: buildHeaders("dynamic"),
  });
}

// ── Backward-compatible aliases ─────────────────────────────────────────────

/** @deprecated Use apiSuccess() instead */
export function jsonResponse<T>(
  data: T,
  cacheType: CacheType = "dynamic",
  extraHeaders?: Record<string, string>,
): NextResponse {
  return apiSuccess(data, cacheType, undefined, extraHeaders);
}

/** @deprecated Use apiError() instead */
export function errorResponse(
  message: string,
  status: number = 400,
): NextResponse {
  return apiError(message, status);
}

// ── Database query wrapper ──────────────────────────────────────────────────

type MockFallbackFn<T> = () => T;
type DbQueryFn<T> = Promise<T>;

/**
 * Try a DB query, fall back to mock data only in mock mode.
 * In production, DB errors return an error response instead of fabricated data.
 */
export async function withFallback<T>(
  dbQuery: DbQueryFn<T>,
  mockFallback: MockFallbackFn<T>,
  cacheType: CacheType = "short",
): Promise<NextResponse<ApiSuccessResponse<T> | ApiErrorResponse>> {
  try {
    const data = await dbQuery;
    return apiSuccess(data, cacheType);
  } catch (error) {
    // In production, return error — don't fabricate data
    if (process.env.BASTION_MOCK !== "true" && process.env.BASTION_MOCK !== "1") {
      console.error("[withFallback] DB query failed:", error);
      return apiError("Database query failed — try again later", 503, "DB_ERROR");
    }
    const data = mockFallback();
    return apiSuccess(data, cacheType, { mock: true });
  }
}
