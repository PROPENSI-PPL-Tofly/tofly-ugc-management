import {
  creatorMaySignIn,
  type BegunInvoice,
  type SignInContract,
} from './creator-access.js';

const TODAY = '2026-11-24';

function paidOn(day: string): BegunInvoice {
  return { status: 'paid', paid_at: new Date(`${day}T05:00:00.000Z`) };
}

function contract(endDay: string, invoice: BegunInvoice = null): SignInContract {
  return { endDay, invoice };
}

const CANCELLED: BegunInvoice = { status: 'cancelled', paid_at: null };

// PRD Sprint 4, cross-PBI rule 1 (PBI-30 + PBI-37): access follows the contracts. Open while a
// period runs or has not started, or while an invoice is not Paid or Cancelled; closed the day
// after everything is settled, and at once when a cancelled invoice leaves nothing else.
describe('creatorMaySignIn', () => {
  describe('while a period runs or waits to start', () => {
    it.each([
      ['ends today', TODAY],
      ['ends next month', '2026-12-24'],
    ])('lets the creator in when a period %s, whatever its invoice', (_, endDay) => {
      expect(creatorMaySignIn(TODAY, [contract(endDay, paidOn('2026-11-01'))])).toBe(true);
    });

    it('lets a renewed creator in on the strength of the period waiting to start', () => {
      expect(
        creatorMaySignIn(TODAY, [
          contract('2026-10-31', paidOn('2026-11-05')),
          contract('2027-02-28', { status: 'running', paid_at: null }),
        ]),
      ).toBe(true);
    });
  });

  describe('once every period has ended', () => {
    it.each([
      ['has no invoice row yet', null],
      ['is still running', { status: 'running', paid_at: null }],
      ['is finalized, waiting for the acknowledge', { status: 'finalized', paid_at: null }],
      ['is acknowledged, waiting for the proof', { status: 'creator_acked', paid_at: null }],
      ['has its proof, waiting for the receipt', { status: 'payment_uploaded', paid_at: null }],
    ] as const)('lets the creator in while an invoice %s', (_, unsettled: BegunInvoice) => {
      expect(
        creatorMaySignIn(TODAY, [
          contract('2026-06-30', paidOn('2026-07-10')),
          contract('2026-10-31', unsettled),
        ]),
      ).toBe(true);
    });

    it('lets the creator in on the day the last invoice is paid, and not the day after', () => {
      expect(creatorMaySignIn(TODAY, [contract('2026-10-31', paidOn(TODAY))])).toBe(true);
      expect(creatorMaySignIn(TODAY, [contract('2026-10-31', paidOn('2026-11-23'))])).toBe(
        false,
      );
    });

    // A paid_at is a Jakarta day: 18.00 UTC on the 23rd is already the 24th in Jakarta.
    it('reads the day an invoice was paid in Jakarta', () => {
      const lateEvening: BegunInvoice = {
        status: 'paid',
        paid_at: new Date('2026-11-23T18:00:00.000Z'),
      };
      expect(creatorMaySignIn(TODAY, [contract('2026-10-31', lateEvening)])).toBe(true);
    });

    // OWASP Top 10:2025 A10: a paid invoice with no recorded moment (the database forbids it) is
    // read as not yet settled rather than crash the sign-in.
    it('reads a paid invoice with no recorded moment as unsettled', () => {
      expect(
        creatorMaySignIn(TODAY, [contract('2026-10-31', { status: 'paid', paid_at: null })]),
      ).toBe(true);
    });
  });

  // PBI-37: a cancelled invoice is never paid, so it settles the period at once.
  describe('a cancelled invoice', () => {
    it('closes access at once, even on the last day of the period it cancelled', () => {
      expect(creatorMaySignIn(TODAY, [contract(TODAY, CANCELLED)])).toBe(false);
    });

    it('closes it only once an earlier invoice is settled too', () => {
      expect(
        creatorMaySignIn(TODAY, [
          contract('2026-08-31', { status: 'creator_acked', paid_at: null }),
          contract(TODAY, CANCELLED),
        ]),
      ).toBe(true);
      expect(
        creatorMaySignIn(TODAY, [contract('2026-08-31', paidOn('2026-09-10')), contract(TODAY, CANCELLED)]),
      ).toBe(false);
    });

    it('never closes a period that waits to start', () => {
      expect(
        creatorMaySignIn(TODAY, [contract(TODAY, CANCELLED), contract('2027-02-28')]),
      ).toBe(true);
    });
  });

  it('keeps a creator with no contract out, since nothing is left to work on or settle', () => {
    expect(creatorMaySignIn(TODAY, [])).toBe(false);
  });
});
