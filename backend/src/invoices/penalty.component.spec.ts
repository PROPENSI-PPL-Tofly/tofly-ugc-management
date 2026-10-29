import { content, context, contract, day } from './invoice-test-data.js';
import { PenaltyComponent } from './penalty.component.js';

const component = new PenaltyComponent();

describe('PenaltyComponent', () => {
  it('charges each day an Evergreen item was handed in late', () => {
    const result = component.calculate(
      context({
        contents: [
          content({
            status: 'link_submitted',
            deadline: day(-10),
            videoSubmittedAt: day(-8),
          }),
        ],
      }),
    );

    expect(result.amount).toBe(30_000);
    expect(result.lines[0].basis).toMatchObject({
      daysLate: 2,
      chargedDays: 2,
      handedIn: 'yes',
    });
  });

  it('stops at maxPenaltyDays, so 21 days late costs 3 days (Rp45.000)', () => {
    const result = component.calculate(
      context({
        contents: [
          content({
            status: 'link_submitted',
            deadline: day(-30),
            videoSubmittedAt: day(-9),
          }),
        ],
      }),
    );

    expect(result.amount).toBe(45_000);
    expect(result.lines[0].basis).toMatchObject({
      daysLate: 21,
      chargedDays: 3,
    });
  });

  it('counts an item not handed in up to today', () => {
    const result = component.calculate(
      context({
        contents: [content({ status: 'scheduled', deadline: day(-2) })],
      }),
    );

    expect(result.amount).toBe(30_000);
    expect(result.lines[0].basis.handedIn).toBe('no');
  });

  it('caps an item never handed in at maxPenaltyDays too', () => {
    const result = component.calculate(
      context({
        contents: [content({ status: 'draft_revision', deadline: day(-20) })],
      }),
    );

    expect(result.amount).toBe(45_000);
  });

  it('does not count days past the contract end for an item never handed in', () => {
    const result = component.calculate(
      context({
        contract: contract({ startDate: day(-60), endDate: day(-9) }),
        contents: [content({ status: 'scheduled', deadline: day(-10) })],
      }),
    );

    expect(result.lines[0].basis.daysLate).toBe(1);
  });

  it('stops counting from the day access was revoked', () => {
    const result = component.calculate(
      context({
        contract: contract({ endedEarlyOn: day(-11) }),
        contents: [content({ status: 'scheduled', deadline: day(-12) })],
      }),
    );

    expect(result.lines[0].basis.daysLate).toBe(1);
  });

  it('charges nothing for content on time or not yet due', () => {
    const result = component.calculate(
      context({
        contents: [
          content({
            id: 'a',
            status: 'link_submitted',
            deadline: day(-3),
            videoSubmittedAt: day(-3),
          }),
          content({ id: 'b', status: 'scheduled', deadline: day(0) }),
          content({ id: 'c', status: 'scheduled', deadline: day(4) }),
        ],
      }),
    );

    expect(result.amount).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it('never penalises Specific content, which loses its fee instead', () => {
    const result = component.calculate(
      context({
        contents: [
          content({ type: 'specific', status: 'scheduled', deadline: day(-5) }),
        ],
      }),
    );

    expect(result.lines).toEqual([]);
  });

  it('ignores a pending proposal', () => {
    const result = component.calculate(
      context({
        contents: [content({ status: 'pending', deadline: day(-5) })],
      }),
    );

    expect(result.lines).toEqual([]);
  });

  it('waits for a formula, with no amount, while none is saved', () => {
    const result = component.calculate(
      context({
        formula: null,
        contents: [content({ status: 'scheduled', deadline: day(-5) })],
      }),
    );

    expect(result).toEqual({
      key: 'penalty',
      amount: null,
      status: 'waiting_for_data',
      lines: [],
    });
  });
});
