import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { RejectNulCharactersInterceptor } from './reject-nul-characters.interceptor.js';

// ZAP's API scan (docs/security/tofly-security-assessment.md) found that a NUL character in a
// JSON text field reaches PostgreSQL, which cannot store it, and the request ends in a 500. The
// interceptor refuses such a body before any handler runs (OWASP A10:2025 Mishandling of
// Exceptional Conditions).

function contextWith(body: unknown): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  } as unknown as ExecutionContext;
}

describe('RejectNulCharactersInterceptor', () => {
  const interceptor = new RejectNulCharactersInterceptor();

  function run(body: unknown) {
    const handle = vi.fn(() => of('handled'));
    const result = interceptor.intercept(contextWith(body), { handle });
    return { handle, result };
  }

  it.each([
    ['a top-level field', { text: 'halo\u0000' }],
    ['a nested field', { contract: { name: 'a\u0000b' } }],
    ['a list item', { tags: ['ok', '\u0000'] }],
    ['an object in a list', { tiers: [{ label: 'x\u0000' }] }],
    ['a key', { ['na\u0000me']: 'ok' }],
  ])(
    'refuses a body with a NUL character in %s with 400, before the handler runs',
    (_, body) => {
      let error: unknown;
      const handle = vi.fn(() => of('handled'));
      try {
        interceptor.intercept(contextWith(body), { handle });
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error).toMatchObject({
        response: {
          code: 'INVALID_CHARACTERS',
          message: 'Teks berisi karakter yang tidak diizinkan',
        },
      });
      expect(handle).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['a clean body', { text: 'halo', amount: 0, flag: false, nothing: null }],
    ['no body', undefined],
    ['a text body', 'plain'],
    ['a list body', [1, 'two', { three: 3 }]],
  ])('lets %s through to the handler', (_, body) => {
    const { handle, result } = run(body);

    expect(handle).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });

  it('leaves non-HTTP contexts alone', () => {
    const handle = vi.fn(() => of('handled'));
    const context = {
      getType: () => 'rpc',
      switchToHttp: () => {
        throw new Error('not http');
      },
    } as unknown as ExecutionContext;

    interceptor.intercept(context, { handle });

    expect(handle).toHaveBeenCalledTimes(1);
  });
});
