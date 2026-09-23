import { generateDeadlineSchedule, type DeadlineScheduleInput } from './deadline-schedule';

const defaultInput: Readonly<DeadlineScheduleInput> = {
  contractStart: '2026-09-20',
  contractEnd: '2026-10-10',
  today: '2026-09-20',
  bufferDays: 5,
  intervalDays: 7,
  quota: 1,
};

describe('generateDeadlineSchedule', () => {
  it('places the first deadline five days after the contract starts when start equals today', () => {
    const deadlines = generateDeadlineSchedule({ ...defaultInput });

    expect(deadlines).toEqual(['2026-09-25']);
  });

  it('calculates the first deadline from today when the contract started in the past', () => {
    const deadlines = generateDeadlineSchedule({
      ...defaultInput,
      contractStart: '2026-09-01',
    });

    expect(deadlines).toEqual(['2026-09-25']);
  });

  it('generates deadlines at the configured interval until the quota is met', () => {
    const deadlines = generateDeadlineSchedule({
      ...defaultInput,
      contractEnd: '2026-10-31',
      quota: 3,
    });

    expect(deadlines).toEqual([
      '2026-09-25',
      '2026-10-02',
      '2026-10-09',
    ]);
  });
});
