import type { INestApplication } from '@nestjs/common';
import { applySecurityHeaders } from './security-headers.js';

describe('applySecurityHeaders', () => {
  it('registers the helmet middleware on the app', () => {
    const app = { use: vi.fn() } as unknown as INestApplication;

    applySecurityHeaders(app);

    expect(app.use).toHaveBeenCalledTimes(1);
    expect(typeof vi.mocked(app.use).mock.calls[0][0]).toBe('function');
  });

  /** The headers the registered middleware sets on one response. */
  function headersSet(): Record<string, string> {
    const app = { use: vi.fn() } as unknown as INestApplication;
    applySecurityHeaders(app);
    const middleware = vi.mocked(app.use).mock.calls[0][0] as unknown as (
      req: unknown,
      res: unknown,
      next: () => void,
    ) => void;
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name.toLowerCase()] = String(value);
      },
      removeHeader: vi.fn(),
    };
    middleware({}, res, vi.fn());
    return headers;
  }

  // OWASP A02:2025 Security Misconfiguration: ZAP's baseline scan flagged the default policy's
  // wildcard and 'unsafe-inline' sources on API responses that reach the browser through the
  // frontend proxy (/api/auth/google). The API serves JSON and redirects, never a page, so its
  // policy allows nothing to load and nothing to frame it.
  // base-uri and form-action do not fall back to default-src, so they are named too (ZAP 10055
  // "Failure to Define Directive with No Fallback" on the first rescan).
  it('sends an API content security policy that allows nothing to load or frame it', () => {
    expect(headersSet()['content-security-policy']).toBe(
      "default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'",
    );
  });

  it("keeps helmet's other hardening headers", () => {
    expect(headersSet()).toMatchObject({
      'x-content-type-options': 'nosniff',
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-frame-options': 'SAMEORIGIN',
      'referrer-policy': 'no-referrer',
    });
  });
});
