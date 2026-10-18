import { FixedRateComponent } from './fixed-rate.component.js';
import { content, context, contract, day } from './invoice-test-data.js';

const component = new FixedRateComponent();

describe('FixedRateComponent', () => {
  it('pays the whole fixed rate of a running contract, however much has been delivered', () => {
    const result = component.calculate(
      context({
        contents: [
          content({
            id: 'a',
            status: 'link_submitted',
            videoSubmittedAt: day(-1),
          }),
          content({ id: 'b', status: 'scheduled' }),
        ],
      }),
    );

    expect(result.amount).toBe(5_500_000);
    expect(result.status).toBe('calculated');
    expect(result.lines[0].basis).toEqual({ delivered: 1, quota: 11 });
  });

  it('still pays in full when the quota is far from met (decided 11 Oct 2026)', () => {
    expect(component.calculate(context()).amount).toBe(5_500_000);
  });

  it('pays nothing for a contract that has not started', () => {
    const result = component.calculate(
      context({ contract: contract({ startDate: day(1), endDate: day(90) }) }),
    );

    expect(result.amount).toBe(0);
  });

  it('pays from the start day itself', () => {
    const result = component.calculate(
      context({ contract: contract({ startDate: day(0) }) }),
    );

    expect(result.amount).toBe(5_500_000);
  });

  it('counts only delivered Evergreen content toward the quota shown', () => {
    const result = component.calculate(
      context({
        contents: [
          content({ id: 'a', status: 'link_submitted' }),
          content({ id: 'b', type: 'specific', status: 'link_submitted' }),
          content({ id: 'c', status: 'draft_approved' }),
        ],
      }),
    );

    expect(result.lines[0].basis.delivered).toBe(1);
  });

  it('names its one line after the contract and counts only handed-in Evergreen items as delivered', () => {
    const result = new FixedRateComponent().calculate(
      context({
        contract: contract({ contentQuota: 3 }),
        contents: [
          content({ id: 'in', status: 'link_submitted' }),
          content({ id: 'also-in', status: 'link_submitted' }),
          content({ id: 'draft', status: 'draft_review' }),
        ],
      }),
    );

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      contentName: 'Kontrak',
      basis: { delivered: 2, quota: 3 },
    });
  });
});
