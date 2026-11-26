import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { assertSameOrigin } from '../same-origin.js';
import { unauthenticated } from '../creator-request.js';
import type { AdminRole } from '../google/ports.js';
import { ACCESS_CHECK, type AccessCheck } from './access-check.js';
import { AppSessionService } from './session.service.js';

/** What a page needs to know about who is signed in; never an id, an email or a session detail. */
export type SessionAnswer =
  { role: 'admin'; adminRole: AdminRole } | { role: 'creator' };

@Controller('auth')
export class SessionController {
  constructor(
    @Inject(AppSessionService) private readonly sessions: AppSessionService,
    @Optional()
    @Inject(ACCESS_CHECK)
    private readonly access?: AccessCheck,
  ) {}

  /**
   * Who is signed in, by role only, so pages can send a signed-out visitor to /login and tell a
   * signed-in one when a page is not theirs. Like the guards, it asks the whitelist again, so a
   * revoked or demoted user reads as signed out. An Admin's role (PBI-23) comes from that same
   * read, so a Super Admin demoted since sign-in loses the Super Admin menus on the next load.
   */
  @Get('session')
  @Header('Cache-Control', 'no-store')
  async session(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionAnswer> {
    const principal = await this.sessions.authenticate(
      (request.cookies as Record<string, unknown> | undefined)?.[
        this.sessions.cookieName()
      ],
      response,
    );
    const current = principal
      ? await this.access?.resolveUser(principal.userId)
      : null;
    if (
      !principal ||
      !current ||
      current.role !== principal.role ||
      (current.role === 'creator' &&
        principal.role === 'creator' &&
        current.creatorId !== principal.creatorId)
    ) {
      throw unauthenticated();
    }
    // Fails closed: an Admin the whitelist gives no role reads as a plain Admin.
    return current.role === 'admin'
      ? { role: 'admin', adminRole: current.adminRole ?? 'admin' }
      : { role: 'creator' };
  }

  @Post('session/activity')
  @HttpCode(HttpStatus.NO_CONTENT)
  async activity(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    assertSameOrigin(request);
    const principal = await this.sessions.authenticate(
      (request.cookies as Record<string, unknown> | undefined)?.[
        this.sessions.cookieName()
      ],
      response,
    );
    if (!principal) throw unauthenticated();
    response.status(HttpStatus.NO_CONTENT).send();
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    assertSameOrigin(request);
    await this.sessions.logout(
      (request.cookies as Record<string, unknown> | undefined)?.[
        this.sessions.cookieName()
      ],
      response,
    );
    response.status(HttpStatus.NO_CONTENT).send();
  }
}
