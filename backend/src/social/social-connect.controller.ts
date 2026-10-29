import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentCreator } from '../auth/current-creator.decorator.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import type { SocialPlatform } from './oauth-state.js';
import {
  SocialConnectService,
  type CallbackQuery,
} from './social-connect.service.js';
import { SocialPlatformPipe } from './social-platform.pipe.js';

/**
 * Connecting a creator's Instagram or TikTok account (PBI-19). The browser reaches these as
 * /api/social/… through the frontend's same-origin proxy. Whose account is connected is the
 * creator the guard resolved from the session, never anything in the URL. Both answers are
 * redirects carrying a single-use state, so neither may be cached.
 */
@Controller('social')
@UseGuards(DevCreatorGuard)
export class SocialConnectController {
  constructor(
    @Inject(SocialConnectService)
    private readonly connects: Pick<SocialConnectService, 'start' | 'complete'>,
  ) {}

  /** The "Hubungkan" button on the Akun Terhubung panel. */
  @Get(':platform/connect')
  async connect(
    @Param('platform', SocialPlatformPipe) platform: SocialPlatform,
    @CurrentCreator() creatorId: string,
    @Res() response: Response,
  ): Promise<void> {
    response.set('Cache-Control', 'no-store');
    response.redirect(302, await this.connects.start(creatorId, platform));
  }

  /** Where the platform sends the creator back after login and consent. */
  @Get(':platform/callback')
  async callback(
    @Param('platform', SocialPlatformPipe) platform: SocialPlatform,
    @CurrentCreator() creatorId: string,
    @Query() query: CallbackQuery,
    @Res() response: Response,
  ): Promise<void> {
    response.set('Cache-Control', 'no-store');
    response.redirect(
      302,
      await this.connects.complete(creatorId, platform, query),
    );
  }
}
