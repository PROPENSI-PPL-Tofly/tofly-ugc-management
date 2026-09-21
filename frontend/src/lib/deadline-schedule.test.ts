import { generateDeadlineSchedule } from './deadline-schedule';

describe('generateDeadlineSchedule', () => {
  it('places the first deadline five days after the contract starts when start equals today', () => {
    const deadlines = generateDeadlineSchedule({
      contractStart: '2026-09-20',
      contractEnd: '2026-10-10',
      today: '2026-09-20',
      bufferDays: 5,
      intervalDays: 7,
      quota: 1,
    });

    expect(deadlines).toEqual(['2026-09-25']);
  });

  it('calculates the first deadline from today when the contract started in the past', () => {
    const deadlines = generateDeadlineSchedule({
      contractStart: '2026-09-01',
      contractEnd: '2026-10-10',
      today: '2026-09-20',
      bufferDays: 5,
      intervalDays: 7,
      quota: 1,
    });

    expect(deadlines).toEqual(['2026-09-25']);
  });
});
