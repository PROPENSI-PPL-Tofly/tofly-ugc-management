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

  it.each([ // Test cases for contract end dates and expected deadlines
    { contractEnd: '2026-10-01', expected: ['2026-09-25'] }, // Only the first deadline is before the contract end
    { contractEnd: '2026-10-02', expected: ['2026-09-25', '2026-10-02'] }, // The first two deadlines are before the contract end
    { contractEnd: '2026-10-03', expected: ['2026-09-25', '2026-10-02'] }, // The first two deadlines are before the contract end
  ])('includes only deadlines on or before contract end $contractEnd', ({ contractEnd, expected }) => {
    const deadlines = generateDeadlineSchedule({
      ...defaultInput, 
      contractEnd,
      quota: 3,
    });

    expect(deadlines).toEqual(expected); // Check that the generated deadlines match the expected deadlines
  });

  it('returns no deadlines when the first deadline would be after the contract ends', () => { // Test case for when the first deadline is after the contract end
    const deadlines = generateDeadlineSchedule({
      ...defaultInput,
      contractEnd: '2026-09-24',
    });

    expect(deadlines).toEqual([]); // Check that no deadlines are generated when the first deadline is after the contract end
  });
});
