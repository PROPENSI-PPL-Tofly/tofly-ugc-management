import { AdditionalContentComponent } from './additional-content.component.js';
import { content, context, day } from './invoice-test-data.js';

const component = new AdditionalContentComponent();

function specific(overrides: Parameters<typeof content>[0] = {}) {
  return content({
    type: 'specific',
    name: 'Unboxing Kelas TOEFL',
    deadline: day(-5),
    ...overrides,
  });
}

describe('AdditionalContentComponent', () => {
  it('pays the flat fee for each Specific item delivered by its deadline', () => {
    const result = component.calculate(
      context({
        contents: [
          specific({
            id: 'a',
            status: 'link_submitted',
            videoSubmittedAt: day(-6),
          }),
          specific({
            id: 'b',
            status: 'link_submitted',
            videoSubmittedAt: day(-5),
          }),
        ],
      }),
    );

    expect(result.amount).toBe(200_000);
    expect(result.lines.map((line) => line.contentId)).toEqual(['a', 'b']);
    expect(result.lines[0]).toMatchObject({
      contentName: 'Unboxing Kelas TOEFL',
      amount: 100_000,
    });
  });

  it('pays Rp0 for a Specific item handed in late (for now, to be confirmed)', () => {
    const result = component.calculate(
      context({
        contents: [
          specific({ status: 'link_submitted', videoSubmittedAt: day(-4) }),
        ],
      }),
    );

    expect(result.amount).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it('pays nothing for Specific content not delivered yet', () => {
    const result = component.calculate(
      context({ contents: [specific({ status: 'draft_approved' })] }),
    );

    expect(result.amount).toBe(0);
  });

  it('ignores a pending proposal an admin has not accepted', () => {
    const result = component.calculate(
      context({ contents: [specific({ status: 'pending' })] }),
    );

    expect(result.lines).toEqual([]);
  });

  it('ignores Evergreen content, which the fixed rate already pays for', () => {
    const result = component.calculate(
      context({
        contents: [
          content({ status: 'link_submitted', videoSubmittedAt: day(9) }),
        ],
      }),
    );

    expect(result.amount).toBe(0);
  });

  it('waits for a formula, with no amount, while none is saved', () => {
    const result = component.calculate(
      context({
        formula: null,
        contents: [
          specific({ status: 'link_submitted', videoSubmittedAt: day(-6) }),
        ],
      }),
    );

    expect(result).toMatchObject({ amount: null, status: 'waiting_for_data' });
  });

  it('pays no fee for Evergreen content handed in on time, and names the fee each line was paid at', () => {
    const result = new AdditionalContentComponent().calculate(
      context({
        contents: [
          content({
            id: 'evergreen',
            type: 'evergreen',
            status: 'link_submitted',
            deadline: day(-2),
            videoSubmittedAt: day(-3),
          }),
          content({
            id: 'specific',
            type: 'specific',
            status: 'link_submitted',
            deadline: day(-2),
            videoSubmittedAt: day(-3),
          }),
        ],
      }),
    );

    expect(result.lines.map((line) => line.contentId)).toEqual(['specific']);
    expect(result.lines[0].basis).toEqual({ fee: 100_000 });
  });
});
