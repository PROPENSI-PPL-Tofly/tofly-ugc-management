import { UnprocessableEntityException } from '@nestjs/common';
import {
  canEnterManually,
  checkManualPerformance,
  effectiveState,
  MAX_METRIC,
  type LinkDataState,
} from './link-performance.js';

function refusal(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected a refusal');
}

function errorsOf(run: () => unknown): Record<string, string> {
  const error = refusal(run);
  expect(error).toBeInstanceOf(UnprocessableEntityException);
  return (
    (error as UnprocessableEntityException).getResponse() as {
      errors: Record<string, string>;
    }
  ).errors;
}

describe('checkManualPerformance', () => {
  it('takes the four numbers an admin typed', () => {
    expect(
      checkManualPerformance({
        views: 12400,
        likes: 830,
        comments: 41,
        shares: 7,
      }),
    ).toEqual({ views: 12400, likes: 830, comments: 41, shares: 7 });
  });

  it('keeps a field left empty as no data, never 0 (AC 15)', () => {
    expect(checkManualPerformance({ views: 12400, likes: '' })).toEqual({
      views: 12400,
      likes: null,
      comments: null,
      shares: null,
    });
  });

  it.each([undefined, null, '', '   '])('reads %j as an empty field', (empty) => {
    expect(checkManualPerformance({ views: 1, shares: empty }).shares).toBe(
      null,
    );
  });

  it('accepts 0 and the highest number, at both ends of the range', () => {
    expect(checkManualPerformance({ views: 0, likes: MAX_METRIC })).toEqual({
      views: 0,
      likes: 999_999_999,
      comments: null,
      shares: null,
    });
  });

  it('reads digits typed in a form field as their number', () => {
    expect(checkManualPerformance({ views: ' 12400 ' }).views).toBe(12400);
  });

  it.each([
    ['one past the highest number', 1_000_000_000],
    ['a negative number', -1],
    ['a fraction', 1.5],
    ['letters', 'banyak'],
    ['a number written with a thousands dot', '12.400'],
    ['a number with a sign', '+5'],
    ['a boolean', true],
    ['an infinite number', Number.POSITIVE_INFINITY],
  ])('refuses %s with a message on that field', (_label, value) => {
    expect(errorsOf(() => checkManualPerformance({ views: value }))).toEqual({
      views: 'Isi bilangan bulat 0 sampai 999.999.999',
    });
  });

  it('answers every refused field at once', () => {
    expect(
      errorsOf(() =>
        checkManualPerformance({ views: -1, likes: 'x', comments: 3 }),
      ),
    ).toEqual({
      views: 'Isi bilangan bulat 0 sampai 999.999.999',
      likes: 'Isi bilangan bulat 0 sampai 999.999.999',
    });
  });

  it.each([{}, { views: '', likes: null }, null, 'views', []])(
    'asks for at least one number when none is filled (%j)',
    (body) => {
      expect(errorsOf(() => checkManualPerformance(body))).toEqual({
        metrics: 'Isi minimal satu angka',
      });
    },
  );
});

describe('effectiveState', () => {
  it('reads a link still waiting as not connected while its account is not connected', () => {
    expect(effectiveState('waiting', false)).toBe('not_connected');
  });

  it('keeps waiting while the account is connected', () => {
    expect(effectiveState('waiting', true)).toBe('waiting');
  });

  it.each<LinkDataState>([
    'not_connected',
    'synced',
    'not_found',
    'sync_failed',
    'manual',
  ])('keeps a stored %s as it is, whatever the account', (state) => {
    expect(effectiveState(state, false)).toBe(state);
    expect(effectiveState(state, true)).toBe(state);
  });
});

describe('canEnterManually (AC 14)', () => {
  it.each<[LinkDataState, boolean]>([
    ['not_connected', true],
    ['not_found', true],
    ['sync_failed', true],
    ['waiting', false],
    ['synced', false],
    // Already filled by hand: correcting it again is allowed.
    ['manual', true],
  ])('%s → %s', (state, allowed) => {
    expect(canEnterManually(state)).toBe(allowed);
  });
});
