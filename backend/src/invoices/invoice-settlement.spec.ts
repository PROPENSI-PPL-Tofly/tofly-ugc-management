import { UnprocessableEntityException } from '@nestjs/common';
import type { InvoiceBreakdown } from './invoice-calculator.js';
import {
  calculated,
  waitingForData,
  type InvoiceLine,
} from './invoice-component.js';
import { settleForFinalize } from './invoice-settlement.js';
import { bonusDataGaps } from './bonus-data-gaps.js';

function line(contentId: string, amount: number): InvoiceLine {
  return { contentId, contentName: contentId, amount, basis: {} };
}

/** A link 28.1 judged but could not measure: Rp0, shown as waiting. */
function waitingLine(contentId: string): InvoiceLine {
  return {
    contentId,
    contentName: contentId,
    amount: 0,
    basis: {
      platform: 'instagram',
      metric: 'views',
      status: 'waiting',
      state: 'not_found',
    },
  };
}

/** A breakdown the calculator could give: 1.000.000 fixed, 50.000 penalty, the bonus as given. */
function breakdown(
  performanceBonus: InvoiceBreakdown['components']['performanceBonus'],
  overrides: Partial<InvoiceBreakdown['components']> = {},
): InvoiceBreakdown {
  const components = {
    fixedRate: calculated('fixedRate', [line('fixed', 1_000_000)]),
    additionalContent: calculated('additionalContent', []),
    performanceBonus,
    penalty: calculated('penalty', [line('late', 50_000)]),
    ...overrides,
  };
  const rawTotal =
    (components.fixedRate.amount ?? 0) +
    (components.additionalContent.amount ?? 0) +
    (components.performanceBonus.amount ?? 0) -
    (components.penalty.amount ?? 0);
  return {
    components,
    rawTotal,
    total: Math.max(0, rawTotal),
    floored: rawTotal < 0,
  };
}

function refusal(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return expect.unreachable('settling must be refused');
}

describe('settleForFinalize', () => {
  it('settles a breakdown with every part calculated as it is', () => {
    const settled = settleForFinalize(
      breakdown(calculated('performanceBonus', [line('evg', 100_000)])),
      false,
    );

    expect(settled.components.performanceBonus).toMatchObject({
      amount: 100_000,
      status: 'calculated',
    });
    expect(settled.rawTotal).toBe(1_050_000);
    expect(settled.performanceBonusPending).toBe(false);
  });

  // OWASP Top 10:2025 A06 (Insecure Design): a bonus still waiting for data is frozen only when
  // the admin has been told and accepted it, never by default.
  it('refuses a bonus still waiting for data unless the admin accepted it', () => {
    const error = refusal(() =>
      settleForFinalize(breakdown(waitingForData('performanceBonus')), false),
    );

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error).toMatchObject({
      response: {
        code: 'INVOICE_BONUS_PENDING',
        message: 'Bonus performa masih menunggu data',
      },
    });
  });

  // AC 9: the refusal lists the waiting links beside "Finalize tetap".
  it('carries the waiting links in the refusal', () => {
    const bonus = waitingForData('performanceBonus', [waitingLine('waiting-1')]);
    const error = refusal(() =>
      settleForFinalize(breakdown(bonus), false, bonusDataGaps(bonus)),
    );

    expect(error).toMatchObject({
      response: {
        code: 'INVOICE_BONUS_PENDING',
        bonusDataGaps: {
          available: true,
          waiting: [
            {
              contentId: 'waiting-1',
              contentName: 'waiting-1',
              platform: 'instagram',
              metric: 'views',
              state: 'not_found',
            },
          ],
        },
      },
    });
  });

  // A frozen invoice no longer waits: its unmeasured links are kept as Rp0 "no data" lines.
  it('freezes each waiting link of an accepted pending bonus as a no_data line', () => {
    const settled = settleForFinalize(
      breakdown(
        waitingForData('performanceBonus', [
          line('measured-1', 100_000),
          waitingLine('waiting-1'),
        ]),
      ),
      true,
    );

    expect(settled.components.performanceBonus.lines).toEqual([
      line('measured-1', 100_000),
      {
        ...waitingLine('waiting-1'),
        basis: { ...waitingLine('waiting-1').basis, status: 'no_data' },
      },
    ]);
    expect(settled.components.performanceBonus.amount).toBe(100_000);
  });

  it('freezes an accepted pending bonus at what the measured content earned', () => {
    const settled = settleForFinalize(
      breakdown(
        waitingForData('performanceBonus', [
          line('measured-1', 100_000),
          line('measured-2', 25_000),
        ]),
      ),
      true,
    );

    expect(settled.components.performanceBonus).toEqual({
      key: 'performanceBonus',
      amount: 125_000,
      status: 'calculated',
      lines: [line('measured-1', 100_000), line('measured-2', 25_000)],
    });
    expect(settled.rawTotal).toBe(1_075_000);
    expect(settled.performanceBonusPending).toBe(true);
  });

  it('freezes an accepted pending bonus with nothing measured at zero', () => {
    const settled = settleForFinalize(
      breakdown(waitingForData('performanceBonus')),
      true,
    );

    expect(settled.components.performanceBonus.amount).toBe(0);
    expect(settled.rawTotal).toBe(950_000);
  });

  // OWASP Top 10:2025 A06 (Insecure Design): accepting a pending bonus covers the bonus alone; a
  // fee or penalty still waiting for a formula cannot be frozen at all.
  it.each([['additionalContent' as const], ['penalty' as const]])(
    'refuses a %s still waiting for data even with the bonus accepted',
    (key) => {
      const error = refusal(() =>
        settleForFinalize(
          breakdown(waitingForData('performanceBonus'), {
            [key]: waitingForData(key),
          }),
          true,
        ),
      );

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(error).toMatchObject({
        response: {
          code: 'INVOICE_DATA_INCOMPLETE',
          message: 'Invoice memiliki komponen yang belum dapat dihitung',
        },
      });
    },
  );

  it('leaves the breakdown it was given unchanged', () => {
    const pending = breakdown(
      waitingForData('performanceBonus', [line('measured', 10_000)]),
    );

    settleForFinalize(pending, true);

    expect(pending.components.performanceBonus.status).toBe('waiting_for_data');
    expect(pending.rawTotal).toBe(950_000);
  });
});
