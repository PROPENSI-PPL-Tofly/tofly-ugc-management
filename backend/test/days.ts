import { jakartaMidnight } from '../src/creators/evergreen.js';

/** A calendar day relative to today in Jakarta, the day the app counts from. */
export function day(offset: number): Date {
  const today = jakartaMidnight(new Date());
  return new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() + offset,
    ),
  );
}
