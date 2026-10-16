import type { INestApplication } from '@nestjs/common';
import { applySecurityHeaders } from './security-headers.js';

type Middleware = (req: unknown, res: unknown, next: (error?: unknown) => void) => void;

/** Runs the registered middleware once and returns the headers it set, by lower-case name. */
function headersSet(): Record<string, string> {
  const app = { use: vi.fn() } as unknown as INestApplication;
  applySecurityHeaders(app);
  const middleware = vi.mocked(app.use).mock.calls[0][0] as unknown as Middleware;

  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = String(value);
    },
    removeHeader: vi.fn(),
  };
  const next = vi.fn();
  middleware({ method: 'GET', headers: {} }, res, next);
  expect(next).toHaveBeenCalledWith();
  return headers;
}

describe('applySecurityHeaders', () => {
  it('registers one middleware on the app', () => {
    const app = { use: vi.fn() } as unknown as INestApplication;

    applySecurityHeaders(app);

    expect(app.use).toHaveBeenCalledTimes(1);
    expect(typeof vi.mocked(app.use).mock.calls[0][0]).toBe('function');
  });

  it('sends an API content security policy that allows nothing to load and no page to frame it', () => {
    expect(headersSet()['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
  });

  it('keeps the other hardening headers helmet sends', () => {
    const headers = headersSet();

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
  });
});
