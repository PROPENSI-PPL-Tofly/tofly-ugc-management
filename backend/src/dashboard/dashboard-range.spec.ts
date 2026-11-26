import { BadRequestException } from '@nestjs/common';
import {
  checkDashboardRange,
  dashboardRange,
  DASHBOARD_RANGES,
  DEFAULT_DASHBOARD_RANGE,
} from './dashboard-range.js';

describe('the executive dashboard range', () => {
  it('offers only 3, 6 and 12 months, with 6 as the default', () => {
    expect(DASHBOARD_RANGES).toEqual([3, 6, 12]);
    expect(DEFAULT_DASHBOARD_RANGE).toBe(6);
    expect(checkDashboardRange(undefined)).toBe(6);
    for (const months of DASHBOARD_RANGES) {
      expect(checkDashboardRange(months)).toBe(months);
    }
  });

  it.each([0, 1, 7, 13, -1, '6', null, 6.5])(
    'refuses the unsupported range %p with a 400',
    (value) => {
      expect(() => checkDashboardRange(value)).toThrow(BadRequestException);
    },
  );

  const today = new Date('2026-11-26T03:00:00.000Z');

  it('reads six full months ending this month, and the six before them', () => {
    expect(dashboardRange(6, today)).toEqual({
      from: '2026-06-01',
      to: '2026-11-30',
      previousFrom: '2025-12-01',
      previousTo: '2026-05-31',
    });
  });

  it('reads three full months', () => {
    expect(dashboardRange(3, today)).toEqual({
      from: '2026-09-01',
      to: '2026-11-30',
      previousFrom: '2026-06-01',
      previousTo: '2026-08-31',
    });
  });

  it('reads twelve full months', () => {
    expect(dashboardRange(12, today)).toEqual({
      from: '2025-12-01',
      to: '2026-11-30',
      previousFrom: '2024-12-01',
      previousTo: '2025-11-30',
    });
  });

  // A day is judged in Jakarta, where the admins work: 30 November 18:00 UTC is already
  // 1 December there, so "this month" must be December, not November.
  it('takes the month from the Jakarta calendar day, not the UTC one', () => {
    expect(dashboardRange(3, new Date('2026-11-30T18:00:00.000Z')).to).toBe(
      '2026-12-31',
    );
  });

  // The previous window must be exactly as long as the current one and end the day before it.
  it('keeps the two windows contiguous and the same length', () => {
    const range = dashboardRange(6, new Date('2027-01-15T03:00:00.000Z'));
    expect(range.to).toBe('2027-01-31');
    expect(range.from).toBe('2026-08-01');
    expect(range.previousTo).toBe('2026-07-31');
    expect(range.previousFrom).toBe('2026-02-01');
  });
});
