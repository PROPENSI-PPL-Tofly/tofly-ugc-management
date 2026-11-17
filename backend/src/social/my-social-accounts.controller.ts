import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CurrentCreator } from '../auth/current-creator.decorator.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import {
  MySocialAccountsService,
  type MySocialAccounts,
} from './my-social-accounts.service.js';
import type { SocialPlatform } from './oauth-state.js';
import { SocialPlatformPipe } from './social-platform.pipe.js';

/**
 * The Akun Terhubung panel (PBI-19). Whose accounts these are is the creator the guard resolved
 * from the session, never anything in the URL, so one creator cannot reach another's (OWASP
 * A01:2025). The guard also refuses a DELETE from another origin.
 */
@Controller('me/social-accounts')
@UseGuards(DevCreatorGuard)
export class MySocialAccountsController {
  constructor(
    @Inject(MySocialAccountsService)
    private readonly accounts: Pick<
      MySocialAccountsService,
      'list' | 'disconnect'
    >,
  ) {}

  @Get()
  list(@CurrentCreator() creatorId: string): Promise<MySocialAccounts> {
    return this.accounts.list(creatorId);
  }

  /** "Putuskan". A 404 means nothing is connected there any more. */
  @Delete(':platform')
  @HttpCode(204)
  async disconnect(
    @Param('platform', SocialPlatformPipe) platform: SocialPlatform,
    @CurrentCreator() creatorId: string,
  ): Promise<void> {
    if (!(await this.accounts.disconnect(creatorId, platform))) {
      throw new NotFoundException();
    }
  }
}
