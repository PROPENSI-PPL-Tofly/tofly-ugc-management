import { StartedPeriodSpecification } from './started-period.specification.js';

// PBI-30.2 (AC 8.2): a period counts as started from 00:00 WIB on its start date. Jakarta is
// UTC+7, so that moment is 17:00 UTC the day before; a UTC day would open the period 7 hours late.

/** A contract period as Postgres `date` columns arrive: midnight UTC of the calendar day. */
const PERIOD = { start_date: new Date('2026-12-02T00:00:00Z') };

describe('StartedPeriodSpecification.isSatisfiedBy', () => {
  it('is not satisfied the day before the period starts', () => {
    const spec = new StartedPeriodSpecification(
      new Date('2026-12-01T05:00:00Z'),
    );

    expect(spec.isSatisfiedBy(PERIOD)).toBe(false);
  });

  it('is not satisfied at the last moment before Jakarta midnight (23:59:59.999 WIB)', () => {
    const spec = new StartedPeriodSpecification(
      new Date('2026-12-01T16:59:59.999Z'),
    );

    expect(spec.isSatisfiedBy(PERIOD)).toBe(false);
  });

  it('is satisfied from Jakarta midnight on the start date, while UTC still reads the day before', () => {
    const spec = new StartedPeriodSpecification(
      new Date('2026-12-01T17:00:00Z'),
    );

    expect(spec.isSatisfiedBy(PERIOD)).toBe(true);
  });

  it('stays satisfied once the period is under way', () => {
    const spec = new StartedPeriodSpecification(
      new Date('2027-01-15T09:00:00Z'),
    );

    expect(spec.isSatisfiedBy(PERIOD)).toBe(true);
  });
});

describe('StartedPeriodSpecification.asWhere', () => {
  it('selects periods starting on or before the Jakarta day, up to 23:59:59.999 WIB', () => {
    const spec = new StartedPeriodSpecification(
      new Date('2026-12-01T16:59:59.999Z'),
    );

    expect(spec.asWhere()).toEqual({
      start_date: { lte: new Date('2026-12-01T00:00:00Z') },
    });
  });

  it('moves to the next day at Jakarta midnight, while UTC still reads the day before', () => {
    const spec = new StartedPeriodSpecification(
      new Date('2026-12-01T17:00:00Z'),
    );

    expect(spec.asWhere()).toEqual({
      start_date: { lte: new Date('2026-12-02T00:00:00Z') },
    });
  });

  it('selects exactly the periods isSatisfiedBy accepts, judged by the same cutoff', () => {
    const spec = new StartedPeriodSpecification(
      new Date('2026-12-01T17:00:00Z'),
    );
    const { lte } = spec.asWhere().start_date;
    const starts = ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03'];

    for (const start of starts) {
      const period = { start_date: new Date(`${start}T00:00:00Z`) };
      expect(period.start_date <= lte).toBe(spec.isSatisfiedBy(period));
    }
  });
});
