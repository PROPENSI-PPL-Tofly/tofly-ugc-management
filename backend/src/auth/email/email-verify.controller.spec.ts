import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import request from 'supertest';
import type { EmailSignInResult } from './email-sign-in.service.js';
import {
  EMAIL_SIGN_IN,
  EmailVerifyController,
} from './email-verify.controller.js';

const ORIGIN = 'http://localhost:3000';
const BODY = { email: 'Rangga@Example.com', code: '123456' };

describe('EmailVerifyController', () => {
  let app: INestApplication;
  const verify =
    vi.fn<
      (
        email: string,
        code: string,
        response: Response,
      ) => Promise<EmailSignInResult>
    >();

  beforeEach(async () => {
    vi.stubEnv('FRONTEND_URL', ORIGIN);
    verify.mockReset();
    const module = await Test.createTestingModule({
      controllers: [EmailVerifyController],
      providers: [{ provide: EMAIL_SIGN_IN, useValue: { verify } }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  function post(body: unknown = BODY) {
    return request(app.getHttpServer())
      .post('/auth/email/verify')
      .set('Origin', ORIGIN)
      .send(body as object);
  }

  it('answers 200 with the home page, keeps the cookie the service set, and is never cached', async () => {
    verify.mockImplementation((_email, _code, response) => {
      response.cookie('__session', 'opaque-id', { httpOnly: true });
      return Promise.resolve({
        outcome: 'signed_in',
        redirectTo: '/creator/dashboard',
      });
    });

    const result = await post().expect(200);

    expect(result.body).toEqual({ redirectTo: '/creator/dashboard' });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['set-cookie']?.[0]).toContain('__session=opaque-id');
    expect(verify).toHaveBeenCalledWith(
      'rangga@example.com',
      '123456',
      expect.anything(),
    );
  });

  it('answers a wrong code with 422 and the attempts left, not 401, which reads as a lost session', async () => {
    verify.mockResolvedValue({ outcome: 'wrong', attemptsLeft: 3 });

    const result = await post().expect(422);

    expect(result.body).toEqual({ code: 'CODE_WRONG', attemptsLeft: 3 });
  });

  it('answers an expired code with 410', async () => {
    verify.mockResolvedValue({ outcome: 'expired' });

    const result = await post().expect(410);

    expect(result.body).toEqual({ code: 'CODE_EXPIRED' });
  });

  it('answers lost access with 403', async () => {
    verify.mockResolvedValue({ outcome: 'denied' });

    const result = await post().expect(403);

    expect(result.body).toEqual({ code: 'ACCESS_DENIED' });
  });

  it('answers a failure with 503 and no detail', async () => {
    verify.mockResolvedValue({ outcome: 'failed' });

    const result = await post().expect(503);

    expect(result.body).toEqual({ code: 'SIGN_IN_FAILED' });
  });

  it('refuses a malformed body with 422 per field, without touching a code', async () => {
    const result = await post({ email: 'a@example.com', code: '12' }).expect(
      422,
    );

    expect(result.body).toEqual({
      message: 'Data tidak valid',
      errors: { code: 'Kode harus 6 digit' },
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it('refuses a request from another origin, so nobody can be signed in to an attacker account', async () => {
    await request(app.getHttpServer())
      .post('/auth/email/verify')
      .set('Origin', 'https://evil.example')
      .send(BODY)
      .expect(403);

    expect(verify).not.toHaveBeenCalled();
  });
});
