import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { authorizationUrl, type GoogleOAuthConfig } from './authorization.js';
import { checkCallback, type CallbackQuery } from './callback.js';
import type { FlowCookie } from './flow-cookie.js';
import type { WarningLog } from './google-sign-in.service.js';
import {
  newFlow,
  parseFlow,
  serializeFlow,
  type OAuthFlow,
} from './oauth-flow.js';
import { loginErrorPath } from './redirects.js';

export const GOOGLE_OAUTH_CONFIG = 'GOOGLE_OAUTH_CONFIG';
export const FLOW_COOKIE = 'FLOW_COOKIE';
export const SIGN_IN = 'SIGN_IN';
export const AUTH_LOG = 'AUTH_LOG';

/** What the callback needs from the sign-in use case. */
export interface SignInCompleter {
  complete(code: string, flow: OAuthFlow, response: Response): Promise<string>;
}

/**
 * "Sign in with Google" (PRD 3.1), OAuth 2.0 authorization code flow with PKCE. The browser
 * reaches these as /api/auth/google… through the frontend's same-origin proxy, which passes
 * the 302s and Set-Cookie headers through. Every answer is a redirect to a fixed path, and
 * none may be cached: each one carries a single-use flow.
 */
@Controller('auth/google')
export class GoogleAuthController {
  constructor(
    @Inject(GOOGLE_OAUTH_CONFIG)
    private readonly config: GoogleOAuthConfig | undefined,
    @Inject(FLOW_COOKIE) private readonly cookie: FlowCookie,
    @Inject(SIGN_IN) private readonly signIn: SignInCompleter,
    @Inject(AUTH_LOG) private readonly log: WarningLog,
  ) {}

  /** The "Masuk dengan Google" button: start a flow and hand the browser to Google. */
  @Get()
  start(@Res() response: Response): void {
    response.set('Cache-Control', 'no-store');
    if (!this.config) {
      this.log.warn(
        'Google sign-in is not configured: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI',
      );
      response.redirect(302, loginErrorPath('sign_in_failed'));
      return;
    }
    const flow = newFlow();
    response.cookie(this.cookie.name, serializeFlow(flow), this.cookie.options);
    response.redirect(302, authorizationUrl(this.config, flow));
  }

  /** Where Google sends the browser back. The flow cookie is spent here, pass or fail. */
  @Get('callback')
  async callback(
    @Query() query: CallbackQuery,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    response.set('Cache-Control', 'no-store');
    const flow = parseFlow(
      (request.cookies as Record<string, unknown> | undefined)?.[
        this.cookie.name
      ],
    );
    const { maxAge: _maxAge, ...clearOptions } = this.cookie.options;
    response.clearCookie(this.cookie.name, clearOptions);

    const checked = checkCallback(query, flow);
    if (!checked.ok) {
      this.log.warn(`Google sign-in callback rejected: ${checked.reason}`);
      response.redirect(302, loginErrorPath(checked.error));
      return;
    }
    response.redirect(
      302,
      await this.signIn.complete(checked.code, checked.flow, response),
    );
  }
}
