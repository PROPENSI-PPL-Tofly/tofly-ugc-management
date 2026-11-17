import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { CodeRequestResult } from './code-request.service.js';
import {
  CODE_REQUEST,
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
        { provide: CODE_REQUEST, useValue: { request: requestCode } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  function post(body: unknown = { email: 'Rangga@Example.com' }) {
    return request(app.getHttpServer())
      .post('/auth/email/request')
      .set('Origin', ORIGIN)
      .send(body as object);
  }

  it('answers 200 with the generic message, never cached', async () => {
    requestCode.mockResolvedValue({ outcome: 'sent' });

    const result = await post().expect(200);

    expect(result.body).toEqual({
      message: 'Kalau email kamu terdaftar, kode sudah dikirim.',
    });
    expect(result.headers['cache-control']).toBe('no-store');
  });

  it('hands the service the trimmed, lower-cased email', async () => {
    requestCode.mockResolvedValue({ outcome: 'sent' });

    await post({ email: '  Rangga@Example.COM ' }).expect(200);

    expect(requestCode).toHaveBeenCalledExactlyOnceWith('rangga@example.com');
  });

  it('answers 429 with the wait in minutes, in the body and in Retry-After', async () => {
    requestCode.mockResolvedValue({ outcome: 'limited', retryAfterMinutes: 7 });

    const result = await post().expect(429);

    expect(result.body).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: 'Terlalu banyak permintaan. Coba lagi dalam 7 menit.',
      retryAfterMinutes: 7,
    });
    expect(result.headers['retry-after']).toBe('420');
    expect(result.headers['cache-control']).toBe('no-store');
  });

  it('answers 503 when the code could not be sent', async () => {
    requestCode.mockResolvedValue({ outcome: 'failed' });

    const result = await post().expect(503);

    expect(result.body).toEqual({
      code: 'CODE_NOT_SENT',
      message: 'Kode gagal dikirim. Coba lagi.',
    });
  });

  it('answers 422 for a malformed email without issuing anything', async () => {
    const result = await post({ email: 'not-an-email' }).expect(422);

    expect(result.body).toEqual({
      message: 'Data tidak valid',
      errors: { email: 'Format email tidak valid' },
    });
    expect(requestCode).not.toHaveBeenCalled();
  });

  it('refuses a request from another site, so no page can make a browser spend the limit', async () => {
    await request(app.getHttpServer())
      .post('/auth/email/request')
      .set('Origin', 'https://evil.example')
      .send({ email: 'rangga@example.com' })
      .expect(403);

    expect(requestCode).not.toHaveBeenCalled();
  });
});
