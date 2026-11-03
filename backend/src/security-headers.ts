import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

/**
 * Hardening headers on every response and no framework banner. The API only ever answers
 * the frontend's proxy, but the headers travel through it to the browser. Shared by the
 * bootstrap and the end-to-end tests so both run the same middleware.
 *
 * The API serves JSON and redirects, never a page, so its content security policy allows
 * nothing to load and nothing to frame it, instead of helmet's page-oriented default with its
 * wildcard and 'unsafe-inline' sources (ZAP baseline finding, OWASP A02:2025). The frontend
 * sends its own nonce-based policy for the pages.
 */
export function applySecurityHeaders(app: INestApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
    }),
  );
}
