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
import type { CodeRequestService } from './code-request.service.js';
import { checkRequestBody } from './request-body.js';

export const CODE_REQUEST = 'CODE_REQUEST';

/** One answer for every address, registered or not (PBI-39). */
export const CODE_SENT_MESSAGE =
  'Kalau email kamu terdaftar, kode sudah dikirim.';

@Controller('auth/email')
export class EmailRequestController {
  constructor(
    @Inject(CODE_REQUEST)
    private readonly codes: Pick<CodeRequestService, 'request'>,
  ) {}

  /** Same-origin only: another site must not spend a user's hourly limit or flood their inbox. */
  @Post('request')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async request(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    assertSameOrigin(request);
    const result = await this.codes.request(checkRequestBody(body));
    switch (result.outcome) {
      case 'sent':
        return { message: CODE_SENT_MESSAGE };
      case 'limited': {
        const minutes = result.retryAfterMinutes;
        response.setHeader('Retry-After', String(minutes * 60));
        throw new HttpException(
          {
            code: 'TOO_MANY_REQUESTS',
            message: `Terlalu banyak permintaan. Coba lagi dalam ${minutes} menit.`,
            retryAfterMinutes: minutes,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      case 'failed':
        throw new ServiceUnavailableException({
          code: 'CODE_NOT_SENT',
          message: 'Kode gagal dikirim. Coba lagi.',
        });
    }
  }
}
