import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { assertSameOrigin } from '../same-origin.js';
import type { EmailCodeRequestService } from './email-code-request.service.js';
import { checkRequestBody } from './request-body.js';

export const EMAIL_CODE_REQUEST = 'EMAIL_CODE_REQUEST';

/** AC 4: "Kirim Ulang" unlocks after this long. */
export const RESEND_AFTER_SECONDS = 60;

/** Its own controller on the shared auth/email prefix, beside SCRUM-241's verify. */
@Controller('auth/email')
export class EmailRequestController {
  constructor(
    @Inject(EMAIL_CODE_REQUEST)
    private readonly codes: Pick<EmailCodeRequestService, 'request'>,
  ) {}

  /**
   * The same 200 for every address with access or without (AC 2). Same-origin only, so no other
   * site can make a visitor's browser fill someone's inbox.
   */
  @Post('request')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async request(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ resendAfterSeconds: number }> {
    assertSameOrigin(request);
    const { email } = checkRequestBody(body);
    const result = await this.codes.request(email);
    switch (result.outcome) {
      case 'sent':
        return { resendAfterSeconds: RESEND_AFTER_SECONDS };
      case 'limited':
        response.setHeader('Retry-After', String(result.minutesToWait * 60));
        throw new HttpException(
          { code: 'TOO_MANY_REQUESTS', minutesToWait: result.minutesToWait },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      case 'failed':
        throw new ServiceUnavailableException({ code: 'CODE_SEND_FAILED' });
    }
  }
}
