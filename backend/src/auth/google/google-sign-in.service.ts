import type { Response } from 'express';
import { IdTokenError } from './google-id-token.js';
import {
  TokenExchangeError,
  type CodeExchanger,
} from './google-token-client.js';
import type { OAuthFlow } from './oauth-flow.js';
import type {
  IdTokenVerifier,
  SessionStarter,
  WhitelistResolver,
} from './ports.js';
import { landingPath, loginErrorPath } from './redirects.js';

/** The logging the service needs; Nest's Logger fits it. */
export interface WarningLog {
  warn(message: string): void;
}

/**
 * A reason for the server log that cannot carry tokens or personal data: exchange and ID token
 * errors are written to be log-safe; anything else (a database error may quote the email) is
 * reduced to its class name.
 */
function safeReason(error: unknown): string {
  if (error instanceof TokenExchangeError || error instanceof IdTokenError) {
    return error.message;
  }
  return error instanceof Error ? error.name : 'unknown error';
}

/**
 * The rest of a Google sign-in once the callback is known to belong to this browser:
 * code → ID token → verified identity → whitelist → session. Google authenticates; only the
 * whitelist authorizes (PRD 3.1). Every failure lands on the login page and never throws,
 * so the browser always gets a redirect rather than an error page.
 */
export class GoogleSignInService {
  constructor(
    private readonly exchanger: CodeExchanger,
    private readonly verifier: IdTokenVerifier,
    private readonly whitelist: WhitelistResolver,
    private readonly session: SessionStarter,
    private readonly logger: WarningLog,
  ) {}

  /** Where to send the browser next. */
  async complete(
    code: string,
    flow: OAuthFlow,
    response: Response,
  ): Promise<string> {
    try {
      const idToken = await this.exchanger.exchange(code, flow.verifier);
      const identity = await this.verifier.verify(idToken, flow.nonce);
      const principal = await this.whitelist.resolve(identity.email);
      if (!principal) {
        this.logger.warn('Google sign-in refused: email not whitelisted');
        return loginErrorPath('not_authorized');
      }
      await this.session.start(response, principal);
      return landingPath(principal);
    } catch (error) {
      this.logger.warn(`Google sign-in failed: ${safeReason(error)}`);
      return loginErrorPath('sign_in_failed');
    }
  }
}
