import { NextResponse } from "next/server";

const CACHE_DURATIONS = {
  static: 300,
  short: 60,
  dynamic: 0,
} as const;

export function jsonResponse<T>(
  data: T,
  cacheType: keyof typeof CACHE_DURATIONS = "dynamic",
  extraHeaders?: Record<string, string>,
): NextResponse {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  const maxAge = CACHE_DURATIONS[cacheType];
  if (maxAge > 0) {
    headers["Cache-Control"] = `public, max-age=${maxAge}, s-maxage=${maxAge * 2}`;
  } else {
    headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
  }

  return NextResponse.json(data, { headers });
}

export function errorResponse(
  message: string,
  status: number = 400,
): NextResponse {
  return NextResponse.json(
    { success: false, error: message },
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    },
  );
}

type MockFallbackFn<T> = () => T;
type DbQueryFn<T> = Promise<T>;

export async function withFallback<T>(
  dbQuery: DbQueryFn<T>,
  mockFallback: MockFallbackFn<T>,
  cacheType: keyof typeof CACHE_DURATIONS = "short",
): Promise<NextResponse> {
  try {
    const data = await dbQuery;
    return jsonResponse(data, cacheType);
  } catch {
    return jsonResponse(mockFallback(), cacheType);
  }
}
