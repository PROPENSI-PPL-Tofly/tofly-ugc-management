import type { GoogleOAuthConfig } from './authorization.js';

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** A sign-in waits on this call; a stalled Google should fail it, not hold it open. */
export const TOKEN_TIMEOUT_MS = 5000;

/**
 * Why the exchange failed, in words safe for the server log: never the code, the client
 * secret, or Google's response body.
 */
export class TokenExchangeError extends Error {
  override readonly name = 'TokenExchangeError';
}

/** Swaps an authorization code for the ID token the verifier then checks. */
export interface CodeExchanger {
  exchange(code: string, verifier: string): Promise<string>;
}

function idTokenOf(body: unknown): string {
  // Reading a property off any other JSON value (number, string, array) gives undefined.
  const idToken = (body as { id_token?: unknown } | null)?.id_token;
  if (typeof idToken !== 'string' || idToken === '') {
    throw new TokenExchangeError('token endpoint sent no ID token');
  }
  return idToken;
}

/**
 * The server-side half of the authorization code flow (RFC 6749 §4.1.3). The client secret
 * and PKCE verifier only ever travel here, server to Google, never through the browser.
 * `fetch` is injected so tests and the e2e suite can stand in for Google.
 */
export class GoogleTokenClient implements CodeExchanger {
  constructor(
    private readonly config: GoogleOAuthConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async exchange(code: string, verifier: string): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchImpl(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
        }).toString(),
        // The token endpoint never redirects; following one would send the secret elsewhere.
        redirect: 'error',
        signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      });
    } catch {
      throw new TokenExchangeError('token endpoint unreachable');
    }

    if (!response.ok) {
      throw new TokenExchangeError(
        `token endpoint answered ${response.status}`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new TokenExchangeError('token endpoint sent no JSON');
    }
    return idTokenOf(body);
  }
}
