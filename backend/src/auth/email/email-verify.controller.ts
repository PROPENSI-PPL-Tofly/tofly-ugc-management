import {
  Body,
  Controller,
  ForbiddenException,
  GoneException,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { assertSameOrigin } from '../same-origin.js';
import type {
  EmailSignInResult,
  EmailSignInService,
} from './email-sign-in.service.js';
import { checkVerifyBody } from './verify-body.js';

export const EMAIL_SIGN_IN = 'EMAIL_SIGN_IN';

/** The refusals as the sign-in screen reads them; it owns the wording. */
function refusal(
  result: Exclude<EmailSignInResult, { outcome: 'signed_in' }>,
): Error {
  switch (result.outcome) {
    case 'wrong':
      // Not 401: the frontend reads that as a lost session and sends the user back to /login.
      return new UnprocessableEntityException({
        code: 'CODE_WRONG',
        attemptsLeft: result.attemptsLeft,
      });
    case 'expired':
      return new GoneException({ code: 'CODE_EXPIRED' });
    case 'denied':
      return new ForbiddenException({ code: 'ACCESS_DENIED' });
    case 'failed':
      return new ServiceUnavailableException({ code: 'SIGN_IN_FAILED' });
  }
}

@Controller('auth/email')
export class EmailVerifyController {
  constructor(
    @Inject(EMAIL_SIGN_IN)
    private readonly signIn: Pick<EmailSignInService, 'verify'>,
  ) {}

  /** Same-origin only: from another site this would sign a victim in to the attacker's account. */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async verify(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ redirectTo: string }> {
    assertSameOrigin(request);
    const { email, code } = checkVerifyBody(body);
    const result = await this.signIn.verify(email, code, response);
    if (result.outcome !== 'signed_in') throw refusal(result);
    return { redirectTo: result.redirectTo };
  }
}
