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
import type { Principal } from '../google/ports.js';
import { ACCESS_CHECK, type AccessCheck } from './access-check.js';
import { AppSessionService } from './session.service.js';

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
   * revoked or demoted user reads as signed out.
   */
  @Get('session')
  @Header('Cache-Control', 'no-store')
  async session(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ role: Principal['role'] }> {
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
    return { role: principal.role };
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
