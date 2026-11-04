import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { CodeRequestResult } from './email-code-request.service.js';
import {
  EMAIL_CODE_REQUEST,
  EmailRequestController,
} from './email-request.controller.js';

const ORIGIN = 'http://localhost:3000';

describe('EmailRequestController', () => {
  let app: INestApplication;
  const requestCode = vi.fn<(email: string) => Promise<CodeRequestResult>>();

  beforeEach(async () => {
    vi.stubEnv('FRONTEND_URL', ORIGIN);
    requestCode.mockReset();
    const module = await Test.createTestingModule({
      controllers: [EmailRequestController],
      providers: [
        { provide: EMAIL_CODE_REQUEST, useValue: { request: requestCode } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  function post(body: unknown = { email: ' Rangga@Example.com ' }) {
    return request(app.getHttpServer())
      .post('/auth/email/request')
      .set('Origin', ORIGIN)
      .send(body as object);
  }

  it('answers 200 with the resend wait, asks for the lower-cased email, and is never cached', async () => {
    requestCode.mockResolvedValue({ outcome: 'sent' });

    const response = await post();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ resendAfterSeconds: 60 });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(requestCode).toHaveBeenCalledExactlyOnceWith('rangga@example.com');
  });

  it('answers 429 with the minutes to wait and a Retry-After in seconds', async () => {
    requestCode.mockResolvedValue({ outcome: 'limited', minutesToWait: 17 });

    const response = await post();

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      code: 'TOO_MANY_REQUESTS',
      minutesToWait: 17,
    });
    expect(response.headers['retry-after']).toBe('1020');
  });

  it('answers 503 CODE_SEND_FAILED when the code could not be sent', async () => {
    requestCode.mockResolvedValue({ outcome: 'failed' });

    const response = await post();

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ code: 'CODE_SEND_FAILED' });
  });

  it('answers 422 naming the field, before any code is drawn', async () => {
    const response = await post({ email: 'not-an-email' });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      message: 'Data tidak valid',
      errors: { email: 'Format email tidak valid' },
    });
    expect(requestCode).not.toHaveBeenCalled();
  });

  it('refuses another site, so no page can flood an inbox with codes', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/email/request')
      .set('Origin', 'https://evil.example')
      .send({ email: 'rangga@example.com' });

    expect(response.status).toBe(403);
    expect(requestCode).not.toHaveBeenCalled();
  });
});
