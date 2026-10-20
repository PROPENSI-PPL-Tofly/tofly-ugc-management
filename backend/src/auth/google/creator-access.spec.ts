import { creatorMaySignIn, type BegunInvoice } from './creator-access.js';

const TODAY = '2026-10-20';

/** A begun contract's invoice as the resolver reads it; null when it has no invoice row yet. */
function paidOn(day: string): BegunInvoice {
  return { status: 'paid', paid_at: new Date(`${day}T05:00:00.000Z`) };
}

describe('creatorMaySignIn', () => {
  describe('before access is revoked', () => {
    it.each([
      ['no revoke date', null],
      ['a revoke date still ahead', '2026-10-21'],
    ])(
      'lets the creator in with %s, whatever their invoices',
      (_, revokeDay) => {
        expect(creatorMaySignIn(revokeDay, TODAY, [])).toBe(true);
      },
    );
  });

  // The prototype's rule (Pembayaran: "akses login dicabut H+1 setelah Paid"): revoking a
  // creator takes effect only once there is nothing left for them to acknowledge or confirm.
  describe('once the revoke date is reached', () => {
    it.each([
      ['today', TODAY],
      ['in the past', '2026-10-01'],
    ])(
      'keeps a revoke date %s in force when nothing is left to settle',
      (_, revokeDay) => {
        expect(creatorMaySignIn(revokeDay, TODAY, [paidOn('2026-10-10')])).toBe(
          false,
        );
      },
    );

    it('keeps a creator with no begun contract out, since there is nothing to settle', () => {
      expect(creatorMaySignIn('2026-10-01', TODAY, [])).toBe(false);
    });

    it.each([
      ['has no invoice row yet', null],
      ['is still running', { status: 'running', paid_at: null }],
      [
        'is finalized, waiting for the acknowledge',
        { status: 'finalized', paid_at: null },
      ],
      [
        'is acknowledged, waiting for the proof',
        { status: 'creator_acked', paid_at: null },
      ],
      [
        'has its proof, waiting for the receipt',
        { status: 'payment_uploaded', paid_at: null },
      ],
    ] as const)(
      'lets the creator in while an invoice %s',
      (_, unsettled: BegunInvoice) => {
        expect(
          creatorMaySignIn('2026-10-01', TODAY, [
            paidOn('2026-09-01'),
            unsettled,
          ]),
        ).toBe(true);
      },
    );

    it('lets the creator in on the day their last invoice is paid, and not the day after', () => {
      expect(creatorMaySignIn('2026-10-01', TODAY, [paidOn(TODAY)])).toBe(true);
      expect(
        creatorMaySignIn('2026-10-01', TODAY, [paidOn('2026-10-19')]),
      ).toBe(false);
    });

    // A paid_at is a Jakarta day: 18.00 UTC on the 19th is already the 20th in Jakarta.
    it('reads the day an invoice was paid in Jakarta', () => {
      const lateEvening = {
        status: 'paid',
        paid_at: new Date('2026-10-19T18:00:00.000Z'),
      } as const;

      expect(creatorMaySignIn('2026-10-01', TODAY, [lateEvening])).toBe(true);
    });

    // OWASP Top 10:2025 A10: a paid invoice with no recorded moment (the database forbids it) is
    // read as not yet settled rather than crash the sign-in.
    it('reads a paid invoice with no recorded moment as unsettled', () => {
      expect(
        creatorMaySignIn('2026-10-01', TODAY, [
          { status: 'paid', paid_at: null },
        ]),
      ).toBe(true);
    });
  });
});
