import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { assertSameOrigin } from '../same-origin.js';
import { unauthenticated } from '../creator-request.js';
import { AppSessionService } from './session.service.js';

@Controller('auth')
export class SessionController {
  constructor(
    @Inject(AppSessionService) private readonly sessions: AppSessionService,
  ) {}

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
