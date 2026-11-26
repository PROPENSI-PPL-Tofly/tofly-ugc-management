import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { RejectNulCharactersInterceptor } from './reject-nul-characters.interceptor.js';

// ZAP's API scan (docs/security/tofly-security-assessment.md) found that a NUL character in a
// JSON text field reaches PostgreSQL, which cannot store it, and the request ends in a 500. The
// interceptor refuses such a body before any handler runs (OWASP A10:2025 Mishandling of
// Exceptional Conditions).

function contextWith(body: unknown, query: unknown = {}): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ body, query }) }),
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

  // A query string carries NUL as %00, and a search box hands it to a LIKE query the same way
  // (GET /admin-users?q=a%00b answered 500 in the #230 review).
  it.each([
    ['the search box', { q: 'a\u0000b' }],
    ['a repeated filter', { status: ['draft', '\u0000'] }],
    ['a query key', { ['q\u0000']: 'ok' }],
  ])(
    'refuses a NUL character in %s of the query string with 400',
    (_, query) => {
      const handle = vi.fn(() => of('handled'));

      expect(() =>
        interceptor.intercept(contextWith(undefined, query), { handle }),
      ).toThrow(BadRequestException);
      expect(handle).not.toHaveBeenCalled();
    },
  );

  it('lets a clean query string through', () => {
    const handle = vi.fn(() => of('handled'));

    interceptor.intercept(contextWith(undefined, { q: 'halo', page: '2' }), {
      handle,
    });

    expect(handle).toHaveBeenCalledTimes(1);
  });

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
