import { BadRequestException } from '@nestjs/common';
import { ExecutiveDashboardController } from './executive-dashboard.controller.js';
import { checkDashboardRange } from './dashboard-range.js';

describe('the executive dashboard controller', () => {
  const today = new Date('2026-11-26T03:00:00.000Z');
  const executive = vi.fn().mockResolvedValue({ kpis: [] });
  const controller = new ExecutiveDashboardController({ executive } as never);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(today);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('passes the validated range to the service', async () => {
    const result = await controller.list(6);

    expect(executive).toHaveBeenCalledWith(today, 6);
    expect(result).toEqual({ kpis: [] });
  });

  it('defaults to six months when no range is asked for', async () => {
    await controller.list(undefined as never);

    expect(executive).toHaveBeenCalledWith(today, 6);
  });

  it('refuses a range the dashboard does not offer', () => {
    expect(() => checkDashboardRange(7)).toThrow(BadRequestException);
  });
});
