import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

/**
 * Hardening headers on every response and no framework banner. The API only ever answers
 * the frontend's proxy, but the headers travel through it to the browser. Shared by the
 * bootstrap and the end-to-end tests so both run the same middleware.
 *
 * Helmet's default content security policy is written for HTML pages. Every answer here is
 * JSON, so nothing should load from it and no page should frame it.
 */
export function applySecurityHeaders(app: INestApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
}
