import { ConflictException } from '@nestjs/common';
import {
  assertActivePeriod,
  assertUsernameEditable,
  contractEndProblem,
  quotaProblem,
  usernameLock,
  type PolicyPeriod,
} from './creator-edit-policy.js';

// 10:00 WIB on 25 November 2026.
const NOW = new Date('2026-11-25T03:00:00Z');

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function period(overrides: Partial<PolicyPeriod> = {}): PolicyPeriod {
  return {
    start_date: day('2026-09-01'),
    end_date: day('2026-12-15'),
    original_end_date: null,
    ...overrides,
  };
}

function refusalOf(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ConflictException);
    return (error as ConflictException).getResponse();
  }
  return expect.unreachable('the policy must refuse the edit');
}

const CONNECTED = { is_connected: true, platform_user_id: 'ig-1', connected_at: NOW };
const DISCONNECTED = { is_connected: false, platform_user_id: 'ig-1', connected_at: null };

describe('usernameLock', () => {
  it.each([
    ['no account and no link', undefined, false, null],
    ['an account that was never connected', DISCONNECTED, false, null],
    ['a connected account', CONNECTED, false, 'connected'],
    ['a submitted link without an account', undefined, true, 'link_submitted'],
    ['a submitted link and a disconnected account', DISCONNECTED, true, 'link_submitted'],
    // The connection is the stronger reason: the username follows the platform's.
    ['both', CONNECTED, true, 'connected'],
    // A row from before PBI-19 carries the flag with no platform account behind it.
    ['the flag alone', { ...CONNECTED, platform_user_id: null }, false, null],
  ] as const)('judges %s', (_label, account, hasLink, lock) => {
    expect(usernameLock(account, hasLink)).toBe(lock);
  });
});

describe('assertUsernameEditable', () => {
  it('lets an unlocked username change', () => {
    expect(() => assertUsernameEditable(null, 'instagram')).not.toThrow();
  });

  it.each([
    ['connected', 'instagram', 'Username Instagram mengikuti akun yang terhubung'],
    ['link_submitted', 'tiktok', 'Username TikTok tidak bisa diubah karena sudah ada link konten yang dikirim'],
  ] as const)('refuses one that is %s', (lock, platform, message) => {
    expect(refusalOf(() => assertUsernameEditable(lock, platform))).toEqual({
      code: 'USERNAME_LOCKED',
      message,
    });
  });
});

describe('assertActivePeriod', () => {
  const NOT_ACTIVE = {
    code: 'PERIOD_NOT_ACTIVE',
    message: 'Akhir kontrak dan jumlah konten hanya bisa diubah selama periode aktif',
  };

  it.each([
    ['its first day', period({ start_date: day('2026-11-25') })],
    ['the middle of it', period()],
    ['its last day', period({ end_date: day('2026-11-25') })],
  ])('accepts %s', (_label, active) => {
    expect(() => assertActivePeriod(active, NOW)).not.toThrow();
  });

  it.each([
    ['one that has not started', period({ start_date: day('2026-11-26') })],
    ['one that has ended', period({ end_date: day('2026-11-24') })],
    ['one that was ended early, still running', period({ original_end_date: day('2027-01-31') })],
  ])('refuses %s', (_label, inactive) => {
    expect(refusalOf(() => assertActivePeriod(inactive, NOW))).toEqual(NOT_ACTIVE);
  });

  it('judges by the day in Jakarta', () => {
    const ended = period({ end_date: day('2026-11-25') });
    // 23:59 WIB on the last day, then midnight WIB.
    expect(() => assertActivePeriod(ended, new Date('2026-11-25T16:59:00Z'))).not.toThrow();
    expect(refusalOf(() => assertActivePeriod(ended, new Date('2026-11-25T17:00:00Z')))).toEqual(
      NOT_ACTIVE,
    );
  });
});

describe('contractEndProblem', () => {
  const NEXT = period({ start_date: day('2027-01-01'), end_date: day('2027-03-31') });
  const LATER = period({ start_date: day('2027-04-01'), end_date: day('2027-06-30') });
  const PAST = period({ start_date: day('2026-03-01'), end_date: day('2026-08-31') });

  it('accepts a later end with no period after this one', () => {
    expect(contractEndProblem(day('2027-12-31'), period(), [PAST, period()])).toBeUndefined();
  });

  it.each(['2026-12-14', '2026-12-15'])('refuses %s, which is not later than the end', (end) => {
    expect(contractEndProblem(day(end), period(), [period()])).toBe(
      'Akhir kontrak hanya bisa dimundurkan dari 15 Des 2026',
    );
  });

  it('accepts the day before the next period starts', () => {
    expect(contractEndProblem(day('2026-12-31'), period(), [NEXT, period()])).toBeUndefined();
  });

  it.each(['2027-01-01', '2027-02-01'])('refuses %s, on or past the next start', (end) => {
    expect(contractEndProblem(day(end), period(), [LATER, NEXT, PAST, period()])).toBe(
      'Paling lambat 31 Des 2026, sehari sebelum Periode 3 mulai',
    );
  });
});

describe('quotaProblem', () => {
  it.each([3, 4, 100])('accepts %d with three Evergreen contents', (quota) => {
    expect(quotaProblem(quota, 3)).toBeUndefined();
  });

  it('refuses fewer than the Evergreen contents already there', () => {
    expect(quotaProblem(2, 3)).toBe('Minimal 3, sesuai konten Evergreen yang sudah ada');
  });
});
