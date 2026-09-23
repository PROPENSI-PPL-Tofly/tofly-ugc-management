import { NextRequest, NextResponse } from "next/server";

// Per-request hardening for every page: scripts run only when they carry this request's
// nonce (Next stamps its own with it), nothing may be framed, and embedded objects, inline
// styles and eval are off. The API proxy and static assets are skipped — they serve JSON
// and files, not documents; the headers that need no nonce are set for every path in
// next.config.ts.

function contentSecurityPolicy(nonce: string): string {
  // Development only: React rebuilds server error stacks with eval, and the Next dev overlay
  // injects its own inline styles. A nonce would make 'unsafe-inline' ignored, so the style
  // directive swaps one for the other. Neither relaxation exists in the production bundle.
  const dev = process.env.NODE_ENV === "development";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${dev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);

  // The nonce travels on the request too, so the rendering pipeline can read it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
