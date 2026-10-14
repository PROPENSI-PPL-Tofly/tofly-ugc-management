import { calculateInvoice, DEFAULT_COMPONENTS } from './invoice-calculator.js';
import type { InvoiceComponent } from './invoice-component.js';
import { content, context, contract, day } from './invoice-test-data.js';

describe('calculateInvoice', () => {
  it('runs the four components in the order they are shown', () => {
    expect(DEFAULT_COMPONENTS.map((component) => component.key)).toEqual([
      'fixedRate',
      'additionalContent',
      'performanceBonus',
      'penalty',
    ]);
  });

  it('adds pay and subtracts the penalty', () => {
    const breakdown = calculateInvoice(
      context({
        contents: [
          content({
            id: 'late',
            status: 'link_submitted',
            deadline: day(-10),
            videoSubmittedAt: day(-8),
          }),
          content({
            id: 'specific',
            type: 'specific',
            status: 'link_submitted',
            deadline: day(-5),
            videoSubmittedAt: day(-5),
            platform: 'instagram',
            views: 12_400,
          }),
        ],
      }),
    );

    // 5.500.000 fixed + 100.000 Specific fee + 150.000 tier 1 − 30.000 two days late
    expect(breakdown.total).toBe(5_720_000);
    expect(breakdown.rawTotal).toBe(5_720_000);
    expect(breakdown.floored).toBe(false);
  });

  it('adds nothing for a component still waiting for data', () => {
    const breakdown = calculateInvoice(context());

    expect(breakdown.components.performanceBonus?.status).toBe(
      'waiting_for_data',
    );
    expect(breakdown.total).toBe(5_500_000);
  });

  it('never goes below zero, and says so when the penalty outweighs the pay', () => {
    const breakdown = calculateInvoice(
      context({
        contract: contract({ fixedRate: 20_000 }),
        contents: [content({ status: 'scheduled', deadline: day(-5) })],
      }),
    );

    expect(breakdown.rawTotal).toBe(-25_000);
    expect(breakdown.total).toBe(0);
    expect(breakdown.floored).toBe(true);
  });

  it('adds up whatever components it is given, so a new kind of pay needs no change here', () => {
    const bonus: InvoiceComponent = {
      key: 'performanceBonus',
      sign: 1,
      calculate: () => ({
        key: 'performanceBonus',
        amount: 1_000,
        status: 'calculated',
        lines: [],
      }),
    };
    const charge: InvoiceComponent = {
      key: 'penalty',
      sign: -1,
      calculate: () => ({
        key: 'penalty',
        amount: 300,
        status: 'calculated',
        lines: [],
      }),
    };

    const breakdown = calculateInvoice(context(), [bonus, charge]);

    expect(breakdown.total).toBe(700);
    expect(Object.keys(breakdown.components)).toEqual([
      'performanceBonus',
      'penalty',
    ]);
  });
});
