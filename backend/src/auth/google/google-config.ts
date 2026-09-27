import type { GoogleOAuthConfig } from './authorization.js';

type Env = Record<string, string | undefined>;

const REQUIRED = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
] as const;

function value(env: Env, name: (typeof REQUIRED)[number]): string {
  return env[name]?.trim() ?? '';
}

/** The OAuth client from the environment, or undefined while any part of it is missing. */
export function googleOAuthConfig(env: Env): GoogleOAuthConfig | undefined {
  const [clientId, clientSecret, redirectUri] = REQUIRED.map((name) =>
    value(env, name),
  );
  if (!clientId || !clientSecret || !redirectUri) {
    return undefined;
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * Google is the only way in (PRD 3.1), so a production backend without its client would
 * serve an app nobody can sign in to. Fail the boot instead, like the database settings do;
 * development and tests may run without it.
 */
export function requireGoogleConfigInProduction(env: Env): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }
  const missing = REQUIRED.filter((name) => !value(env, name));
  if (missing.length > 0) {
    throw new Error(`Missing required env var: ${missing.join(', ')}`);
  }
}
