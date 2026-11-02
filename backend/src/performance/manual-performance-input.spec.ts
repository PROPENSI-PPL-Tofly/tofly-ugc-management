import { UnprocessableEntityException } from '@nestjs/common';
import { checkManualPerformance } from './manual-performance-input.js';

describe('checkManualPerformance', () => {
  it('keeps whole numbers as given, a real 0 included', () => {
    expect(
      checkManualPerformance({
        views: 12400,
        likes: 500,
        comments: 0,
        shares: 7,
      }),
    ).toEqual({ views: 12400, likes: 500, comments: 0, shares: 7 });
  });

  it('reads a missing, null or blank field as no data, never as 0', () => {
    expect(
      checkManualPerformance({ views: 1, likes: null, comments: '  ' }),
    ).toEqual({ views: 1, likes: null, comments: null, shares: null });
  });

  it('accepts the largest count, 999,999,999', () => {
    expect(checkManualPerformance({ shares: 999_999_999 }).shares).toBe(
      999_999_999,
    );
  });

  /** The 422 a body is refused with, or null when it was accepted. */
  function refusal(body: unknown): unknown {
    try {
      checkManualPerformance(body);
      return null;
    } catch (error) {
      if (!(error instanceof UnprocessableEntityException)) throw error;
      return error.getResponse();
    }
  }

  // One partition per way a value can fail to be a count: below the range, above it, not whole,
  // a number written as text (a typed form value is sent as a number), and not a number at all.
  it.each([
    ['below 0', -1],
    ['above 999,999,999', 1_000_000_000],
    ['past the safe integer range', Number.MAX_SAFE_INTEGER + 2],
    ['a fraction', 1.5],
    ['digits as text', '12400'],
    ['an exponent as text', '1e3'],
    ['words', 'abc'],
    ['a boolean', true],
    ['an object', {}],
    ['a list', [1]],
  ])('refuses %s with an error on that field only', (_case, value) => {
    expect(refusal({ views: 10, likes: value })).toEqual({
      message: 'Data performa tidak valid',
      errors: { likes: 'Isi bilangan bulat 0 sampai 999.999.999' },
    });
  });

  it('answers every refused field in one 422', () => {
    expect(
      refusal({ views: -5, likes: 2.5, comments: 'x', shares: 10 ** 10 }),
    ).toEqual({
      message: 'Data performa tidak valid',
      errors: {
        views: 'Isi bilangan bulat 0 sampai 999.999.999',
        likes: 'Isi bilangan bulat 0 sampai 999.999.999',
        comments: 'Isi bilangan bulat 0 sampai 999.999.999',
        shares: 'Isi bilangan bulat 0 sampai 999.999.999',
      },
    });
  });
});
