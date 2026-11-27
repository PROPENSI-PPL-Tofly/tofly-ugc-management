import type { SignInContract } from '../auth/google/creator-access.js';
import { accessClosesAfterPaid } from './access-after-paid.js';

// PBI-11 AC 3, on the access rule PBI-30 and PBI-37 share (creator-access.ts): access stays while
// a period runs or waits, or an invoice is unsettled, and closes the day after the last is Paid.
describe('accessClosesAfterPaid', () => {
  const TODAY = '2026-11-25';
  const paidToday = { status: 'paid' as const, paid_at: new Date('2026-11-25T03:00:00.000Z') };

  it('names tomorrow when the invoice just paid was the last thing keeping access open', () => {
    const contracts: SignInContract[] = [{ endDay: '2026-11-20', invoice: paidToday }];

    expect(accessClosesAfterPaid(TODAY, contracts)).toBe('2026-11-26');
  });

  it.each<[string, SignInContract]>([
    ['a period that has not started', { endDay: '2027-02-28', invoice: { status: 'running', paid_at: null } }],
    ['an earlier invoice still unsettled', { endDay: '2026-10-31', invoice: { status: 'payment_uploaded', paid_at: null } }],
  ])('names no day while %s keeps access open', (_, other) => {
    const contracts: SignInContract[] = [{ endDay: '2026-11-20', invoice: paidToday }, other];

    expect(accessClosesAfterPaid(TODAY, contracts)).toBeNull();
  });

  it('names no day while the paid contract itself still runs tomorrow', () => {
    expect(accessClosesAfterPaid(TODAY, [{ endDay: '2026-12-31', invoice: paidToday }])).toBeNull();
  });
});
