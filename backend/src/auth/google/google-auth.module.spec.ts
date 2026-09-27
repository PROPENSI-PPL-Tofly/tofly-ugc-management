import { Logger } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { AppModule } from '../../app.module.js';
import {
  AUTH_LOG,
  FLOW_COOKIE,
  GOOGLE_OAUTH_CONFIG,
  GoogleAuthController,
  SIGN_IN,
} from './google-auth.controller.js';
import { GoogleAuthModule } from './google-auth.module.js';
import { GoogleSignInService } from './google-sign-in.service.js';
import { GoogleTokenClient } from './google-token-client.js';
import {
  CODE_EXCHANGER,
  ID_TOKEN_VERIFIER,
  SESSION_STARTER,
  WHITELIST_RESOLVER,
  type IdTokenVerifier,
  type SessionStarter,
  type WhitelistResolver,
} from './ports.js';
import type { CodeExchanger } from './google-token-client.js';

async function compile() {
  return Test.createTestingModule({ imports: [GoogleAuthModule] }).compile();
}

describe('GoogleAuthModule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('wires the controller, the sign-in, the flow cookie and a logger', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const module = await compile();

    expect(module.get(GoogleAuthController)).toBeInstanceOf(
      GoogleAuthController,
    );
    expect(module.get(SIGN_IN)).toBeInstanceOf(GoogleSignInService);
    expect(module.get(FLOW_COOKIE).name).toBe('__Host-tofly_oauth');
    expect(module.get(AUTH_LOG)).toBeInstanceOf(Logger);
  });

  it('exchanges codes with Google once the client is configured', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client-123.apps.googleusercontent.com');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret-xyz');
    vi.stubEnv('GOOGLE_REDIRECT_URI', 'http://localhost:3000/cb');
    const module = await compile();

    expect(module.get(GOOGLE_OAUTH_CONFIG)).toEqual({
      clientId: 'client-123.apps.googleusercontent.com',
      clientSecret: 'secret-xyz',
      redirectUri: 'http://localhost:3000/cb',
    });
    expect(module.get(CODE_EXCHANGER)).toBeInstanceOf(GoogleTokenClient);
  });

  it('refuses every exchange while the client is not configured', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    const module = await compile();

    expect(module.get(GOOGLE_OAUTH_CONFIG)).toBeUndefined();
    await expect(
      module.get<CodeExchanger>(CODE_EXCHANGER).exchange('code', 'verifier'),
    ).rejects.toThrow('Google sign-in is not configured');
  });

  // Until the token check, the whitelist and the session land, no sign-in can succeed.
  it.each([
    [
      'verifier',
      (m: Awaited<ReturnType<typeof compile>>) =>
        m.get<IdTokenVerifier>(ID_TOKEN_VERIFIER).verify('token', 'nonce'),
    ],
    [
      'whitelist',
      (m: Awaited<ReturnType<typeof compile>>) =>
        m.get<WhitelistResolver>(WHITELIST_RESOLVER).resolve('a@b.co'),
    ],
    [
      'session',
      (m: Awaited<ReturnType<typeof compile>>) =>
        m
          .get<SessionStarter>(SESSION_STARTER)
          .start({} as Response, { userId: 'u', role: 'admin' }),
    ],
  ])('binds a %s that fails closed by default', async (_label, call) => {
    const module = await compile();

    await expect(call(module)).rejects.toMatchObject({ name: 'PortNotReady' });
  });

  it('is part of the application', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule,
    ) as unknown[];

    expect(imports).toContain(GoogleAuthModule);
  });
});
