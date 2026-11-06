import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppModule, validate } from './app.module.js';
import { RejectNulCharactersInterceptor } from './reject-nul-characters.interceptor.js';

describe('AppModule', () => {
  // OWASP A10:2025: every route refuses a NUL character in its body before a handler runs
  // (docs/security/tofly-security-assessment.md, V1).
  it('registers the NUL-character check for every route', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule),
    ).toContainEqual({
      provide: APP_INTERCEPTOR,
      useClass: RejectNulCharactersInterceptor,
    });
  });
});

describe('validate (environment at boot)', () => {
  const complete = {
    DATABASE_URL: 'postgresql://app@localhost/db',
    DIRECT_URL: 'postgresql://app@localhost/db',
  };

  it.each(['DATABASE_URL', 'DIRECT_URL'])(
    'fails fast when %s is missing',
    (key) => {
      expect(() => validate({ ...complete, [key]: '' })).toThrow(
        `Missing required env var: ${key}`,
      );
    },
  );

  it('accepts a configuration naming both database URLs', () => {
    expect(validate(complete)).toBe(complete);
  });
});
