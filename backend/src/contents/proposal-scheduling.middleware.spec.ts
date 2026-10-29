import { describe, expect, it, vi } from 'vitest';
import { ProposalSchedulingMiddleware } from './proposal-scheduling.middleware.js';

describe('ProposalSchedulingMiddleware', () => {
  it('schedules the proposals due at H-1 before the request goes on', async () => {
    const order: string[] = [];
    const scheduleDue = vi.fn(async () => {
      order.push('scheduleDue');
      return 2;
    });
    const next = vi.fn(() => order.push('next'));

    await new ProposalSchedulingMiddleware({ scheduleDue }).use({}, {}, next);

    expect(scheduleDue).toHaveBeenCalledWith(expect.any(Date));
    expect(next).toHaveBeenCalledWith();
    expect(order).toEqual(['scheduleDue', 'next']);
  });

  it('hands a failure to Nest instead of letting the request read stale statuses', async () => {
    const failure = new Error('database unreachable');
    const next = vi.fn();

    await new ProposalSchedulingMiddleware({
      scheduleDue: vi.fn().mockRejectedValue(failure),
    }).use({}, {}, next);

    expect(next).toHaveBeenCalledWith(failure);
  });
});
