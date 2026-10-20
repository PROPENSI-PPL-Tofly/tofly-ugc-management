import {
  contractLastDay,
  daysBetween,
  daysLate,
  onTime,
} from './invoice-days.js';
import { day } from './invoice-test-data.js';

describe('daysBetween', () => {
  it('counts whole calendar days, negative when the second day is earlier', () => {
    expect(daysBetween('2026-09-18', '2026-09-21')).toBe(3);
    expect(daysBetween('2026-09-18', '2026-09-18')).toBe(0);
    expect(daysBetween('2026-09-21', '2026-09-18')).toBe(-3);
  });
});

describe('daysLate', () => {
  it('is 0 for a hand-in on the deadline day itself', () => {
    expect(daysLate(day(0), new Date('2026-09-18T10:00:00Z'))).toBe(0);
  });

  it('is 0 for a hand-in before the deadline', () => {
    expect(daysLate(day(0), day(-2))).toBe(0);
  });

  it('counts the Jakarta day, so 17:00 UTC on the deadline is already the next day', () => {
    expect(daysLate(day(0), new Date('2026-09-18T17:00:00Z'))).toBe(1);
  });

  it('counts each day after the deadline', () => {
    expect(daysLate(day(0), day(5))).toBe(5);
  });
});

describe('onTime', () => {
  it('is false while nothing has been handed in', () => {
    expect(onTime(day(0), null)).toBe(false);
  });

  it('is true on the deadline day and false a day after', () => {
    expect(onTime(day(0), day(0))).toBe(true);
    expect(onTime(day(0), day(1))).toBe(false);
  });
});

describe('contractLastDay', () => {
  it('is the end date when access was never revoked', () => {
    expect(contractLastDay({ endDate: day(30), endedEarlyOn: null })).toBe(
      '2026-10-18',
    );
  });

  it('is the revocation day when access was revoked before the end', () => {
    expect(contractLastDay({ endDate: day(30), endedEarlyOn: day(5) })).toBe(
      '2026-09-23',
    );
  });

  it('keeps the end date when the revocation came after it', () => {
    expect(contractLastDay({ endDate: day(30), endedEarlyOn: day(40) })).toBe(
      '2026-10-18',
    );
  });
});
