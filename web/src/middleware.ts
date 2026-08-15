import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const startedAt = performance.now();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-request-id", requestId);

  if (process.env.NODE_ENV !== "production") {
    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "s-link-api",
        level: "info",
        event: "api.request",
        request_id: requestId,
        method: request.method,
        path: request.nextUrl.pathname,
        elapsed_ms: Math.round(performance.now() - startedAt),
      }),
    );
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
