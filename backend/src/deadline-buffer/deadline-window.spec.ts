import {
  DEFAULT_BUFFER_DAYS,
  DeadlineWindow,
  MAX_BUFFER_DAYS,
  MIN_BUFFER_DAYS,
} from './deadline-window.js';

const FACTS = {
  contractStart: '2026-12-01',
  contractEnd: '2026-12-31',
  today: '2026-11-23',
  bufferDays: 5,
};

describe('DeadlineWindow (SCRUM-298, PBI-23 AC 22)', () => {
  it('holds the buffer the prototype starts with, between 1 and 14 days (AC 20)', () => {
    expect([MIN_BUFFER_DAYS, DEFAULT_BUFFER_DAYS, MAX_BUFFER_DAYS]).toEqual([
      1, 5, 14,
    ]);
  });

  describe('one buffer drives both lines', () => {
    it('opens the buffer after the contract start and closes the buffer before its end', () => {
      const window = DeadlineWindow.of(FACTS);

      expect(window.earliest).toBe('2026-12-06');
      expect(window.latest).toBe('2026-12-26');
      expect(window.bufferDays).toBe(5);
    });

    it('counts from today once the contract has already started', () => {
      const window = DeadlineWindow.of({ ...FACTS, today: '2026-12-10' });

      expect(window.earliest).toBe('2026-12-15');
    });

    it('moves both lines together when the buffer changes', () => {
      const window = DeadlineWindow.of({ ...FACTS, bufferDays: 7 });

      expect([window.earliest, window.latest]).toEqual([
        '2026-12-08',
        '2026-12-24',
      ]);
    });

    it('counts across a month end and a leap day', () => {
      const window = DeadlineWindow.of({
        contractStart: '2028-02-27',
        contractEnd: '2028-03-02',
        today: '2028-02-01',
        bufferDays: 3,
      });

      expect([window.earliest, window.latest]).toEqual([
        '2028-03-01',
        '2028-02-28',
      ]);
    });
  });

  describe('problem', () => {
    const window = DeadlineWindow.of(FACTS);

    it('accepts both lines and the days between them', () => {
      expect(window.problem('2026-12-06')).toBeUndefined();
      expect(window.problem('2026-12-15')).toBeUndefined();
      expect(window.problem('2026-12-26')).toBeUndefined();
    });

    it('refuses the day before the earliest line', () => {
      expect(window.problem('2026-12-05')).toBe(
        'Deadline paling cepat 6 Des 2026',
      );
    });

    // H-5 is no longer a fixed rule: the line names the buffer it was drawn with.
    it('refuses the day after the latest line, naming the buffer', () => {
      expect(window.problem('2026-12-27')).toBe(
        'Deadline paling lambat 26 Des 2026 (H-5 akhir kontrak)',
      );
      expect(
        DeadlineWindow.of({ ...FACTS, bufferDays: 9 }).problem('2026-12-23'),
      ).toBe('Deadline paling lambat 22 Des 2026 (H-9 akhir kontrak)');
    });

    it('words each refusal on its own as well', () => {
      expect(window.tooEarly()).toBe('Deadline paling cepat 6 Des 2026');
      expect(window.tooLate()).toBe(
        'Deadline paling lambat 26 Des 2026 (H-5 akhir kontrak)',
      );
    });
  });

  // A window drawn with a buffer the setting can never hold is a bug upstream, not a schedule
  // (OWASP A08:2025, A10:2025): it fails loudly instead of judging deadlines by it.
  it.each([0, 15, 4.5, Number.NaN])(
    'refuses to draw a window with a buffer of %s',
    (bufferDays) => {
      expect(() => DeadlineWindow.of({ ...FACTS, bufferDays })).toThrow(
        RangeError,
      );
    },
  );
});
