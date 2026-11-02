import { Controller, Get, Inject, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentCreator } from '../../auth/current-creator.decorator.js';
import { DevCreatorGuard } from '../../auth/dev-creator.guard.js';
import type { WarningLog } from '../../auth/google/google-sign-in.service.js';
import { connectErrorPath, type ConnectError } from '../connect-redirects.js';
import { signState, verifyState } from '../connect-state.js';
import { instagramAuthorizationUrl } from './instagram-authorization.js';
import type { InstagramConfig } from './instagram-config.js';

export const INSTAGRAM_CONFIG = 'INSTAGRAM_CONFIG';
export const INSTAGRAM_CONNECT = 'INSTAGRAM_CONNECT';
export const INSTAGRAM_LOG = 'INSTAGRAM_LOG';

// Instagram's codes are a few hundred characters; anything far longer is not one.
export const MAX_INSTAGRAM_CODE_LENGTH = 1024;

// What the callback needs from the connect use case: the path to land on.
export interface ConnectCompleter {
  complete(creatorId: string, code: string): Promise<string>;
}

// The query Instagram redirects back with, straight from the request.
interface CallbackQuery {
  code?: unknown;
  state?: unknown;
  error?: unknown;
}

const NOT_CONFIGURED =
  'not configured: set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI and SOCIAL_STATE_SECRET (at least 32 characters)';

// Instagram ends the redirect with '#_'; a browser drops it, a pasted address may not.
function codeOf(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const code = value.endsWith('#_') ? value.slice(0, -2) : value;
  return code !== '' && code.length <= MAX_INSTAGRAM_CODE_LENGTH
    ? code
    : undefined;
}

// "Hubungkan" for Instagram (PBI-19, 19.1), through the frontend's same-origin proxy as
// /api/social/instagram/…. Only a signed-in creator reaches either route, and the creator is
// always the one the session names, never one from the URL. Every answer is a redirect that
// must not be cached: each carries a single attempt.
@Controller('social/instagram')
@UseGuards(DevCreatorGuard)
export class InstagramConnectController {
  constructor(
    @Inject(INSTAGRAM_CONFIG)
    private readonly config: InstagramConfig | undefined,
    @Inject(INSTAGRAM_CONNECT) private readonly connect: ConnectCompleter,
    @Inject(INSTAGRAM_LOG) private readonly log: WarningLog,
  ) {}

  @Get('connect')
  start(@CurrentCreator() creatorId: string, @Res() response: Response): void {
    response.set('Cache-Control', 'no-store');
    if (!this.config) {
      return this.fail(response, 'platform_error', NOT_CONFIGURED);
    }
    const state = signState(
      { creatorId, platform: 'instagram' },
      this.config.stateSecret,
    );
    response.redirect(302, instagramAuthorizationUrl(this.config, state));
  }

  @Get('callback')
  async callback(
    @Query() query: CallbackQuery,
    @CurrentCreator() creatorId: string,
    @Res() response: Response,
  ): Promise<void> {
    response.set('Cache-Control', 'no-store');
    if (!this.config) {
      return this.fail(response, 'platform_error', NOT_CONFIGURED);
    }
    // AC 14: the state is checked first, so nothing else in the query is trusted before it
    // proves this creator started this attempt.
    if (
      !verifyState(query.state, this.config.stateSecret, {
        creatorId,
        platform: 'instagram',
      })
    ) {
      return this.fail(response, 'platform_error', 'state refused');
    }
    if (query.error !== undefined) {
      return query.error === 'access_denied'
        ? this.fail(response, 'cancelled', 'refused on the consent screen')
        : this.fail(response, 'platform_error', 'Instagram returned an error');
    }
    const code = codeOf(query.code);
    if (!code) {
      return this.fail(response, 'platform_error', 'missing or malformed code');
    }
    response.redirect(302, await this.connect.complete(creatorId, code));
  }

  private fail(response: Response, error: ConnectError, reason: string): void {
    this.log.warn(`Instagram connect refused (${error}): ${reason}`);
    response.redirect(302, connectErrorPath('instagram', error));
  }
}
