import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

function headersFor(url = "http://localhost:3000/admin/creators") {
  return proxy(new NextRequest(url)).headers;
}

describe("proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends a strict Content-Security-Policy with a fresh nonce per request", () => {
    const first = headersFor().get("content-security-policy") ?? "";
    const second = headersFor().get("content-security-policy") ?? "";

    expect(first).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(first).toContain("default-src 'self'");
    expect(first).toContain("object-src 'none'");
    expect(first).toContain("frame-ancestors 'none'");
    expect(first).toContain("base-uri 'self'");
    expect(first).toContain("form-action 'self'");
    expect(first).not.toContain("unsafe-inline");
    expect(first).not.toContain("unsafe-eval");
    expect(first).not.toBe(second);
  });

  it("relaxes only what the dev tooling needs, and only in development", () => {
    vi.stubEnv("NODE_ENV", "development");

    const csp = headersFor().get("content-security-policy") ?? "";
    expect(csp).toMatch(/script-src [^;]*'unsafe-eval'/);
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toMatch(/style-src [^;]*nonce/);
  });

  it("stamps styles with the nonce outside development", () => {
    expect(headersFor().get("content-security-policy")).toMatch(/style-src 'self' 'nonce-/);
  });

  it("hands the nonce to the page so Next can stamp its own scripts with it", () => {
    const response = proxy(new NextRequest("http://localhost:3000/admin/creators"));
    const nonce = /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy") ?? "")?.[1];

    expect(nonce).toBeTruthy();
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
  });

  it("sends the other hardening headers", () => {
    const headers = headersFor();

    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()");
    expect(headers.get("cross-origin-resource-policy")).toBe("same-origin");
  });

  it("leaves static assets and the API proxy alone", () => {
    expect(config.matcher).toEqual([
      {
        source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
        missing: [
          { type: "header", key: "next-router-prefetch" },
          { type: "header", key: "purpose", value: "prefetch" },
        ],
      },
    ]);
  });
});
