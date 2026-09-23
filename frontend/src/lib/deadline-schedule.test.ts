import {
  getBufferWindow,
  generateDeadlineSchedule,
  getDeadlinePreview,
  type DeadlineScheduleInput,
} from './deadline-schedule';

const defaultInput: Readonly<DeadlineScheduleInput> = {
  contractStart: '2026-09-20',
  contractEnd: '2026-10-10',
  today: '2026-09-20',
  bufferDays: 5,
  intervalDays: 7,
  quota: 1,
};

describe('getBufferWindow', () => {
  it.each([
    ['2026-09-01', '2026-09-20', '2026-09-25'],
    ['2026-09-20', '2026-09-20', '2026-09-25'],
    ['2026-09-30', '2026-09-30', '2026-10-05'],
  ])('calculates the buffer for contract start %s', (contractStart, start, end) => {
    const window = getBufferWindow({ ...defaultInput, contractStart });

    expect(window.bufferStartDate).toEqual(new Date(`${start}T00:00:00Z`));
    expect(window.firstAllowedDate).toEqual(new Date(`${end}T00:00:00Z`));
  });
});

describe('generateDeadlineSchedule', () => { 
  it('places the first deadline five days after the contract starts when start equals today', () => { // Test case for when the contract start date is the same as today
    const deadlines = generateDeadlineSchedule({ ...defaultInput });

    expect(deadlines).toEqual(['2026-09-25']);
  });

  it('calculates the first deadline from today when the contract started in the past', () => { // Test case for when the contract start date is in the past
    const deadlines = generateDeadlineSchedule({
      ...defaultInput,
      contractStart: '2026-09-01',
    });

    expect(deadlines).toEqual(['2026-09-25']);
  });

  it('generates deadlines at the configured interval until the quota is met', () => { // Test case for generating multiple deadlines based on the interval and quota
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

describe('getDeadlinePreview', () => { 
  it('reports remaining slots when automatic deadlines cannot fill the quota', () => { // Test case for when the automatic deadlines do not fill the quota
    const preview = getDeadlinePreview({ 
      ...defaultInput,
      contractEnd: '2026-10-03',
      quota: 4,
    });

    expect(preview).toEqual({ 
      autoDeadlines: [
        '2026-09-25',
        '2026-10-02',
      ],
      allocatedCount: 2, // Check that the allocated count is 2, which is the number of automatic deadlines generated
      remainingCount: 2, // Check that the remaining count is 2, which is the number of slots left to be filled
      quota: 4, 
    });
  });
});
