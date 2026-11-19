import type { Specification } from '../specification.js';
import { jakartaMidnight } from './evergreen.js';

/** A contract period, as far as this rule reads it: its start day, as Postgres `date` arrives. */
export interface PeriodStart {
  start_date: Date;
}

/**
 * PBI-30.2 (AC 8.2): a contract period has started once Jakarta has reached its start date.
 * Until then its content is not the creator's to see in Task Saya or to hand in.
 *
 * The cutoff — today in Jakarta, as midnight UTC like a `date` column — is worked out once, in
 * the constructor, from the one `now` the caller passes, so every check made with one instance
 * judges by the same day.
 */
export class StartedPeriodSpecification implements Specification<PeriodStart> {
  private readonly cutoff: Date;

  constructor(now: Date) {
    this.cutoff = jakartaMidnight(now);
  }

  isSatisfiedBy(period: PeriodStart): boolean {
    return period.start_date.getTime() <= this.cutoff.getTime();
  }
}
