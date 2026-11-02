// The body of PUT /contents/:id/links/:platform/performance (PBI-27 27.1, AC 15), checked at the
// HTTP boundary so the rest of manual entry only ever sees four numbers or nulls.

import { UnprocessableEntityException } from '@nestjs/common';

export type MetricName = 'views' | 'likes' | 'comments' | 'shares';

/** A link's four counts; null is "no data yet", never 0 (AC 2). */
export type PerformanceMetrics = Record<MetricName, number | null>;

/** The four counts in the order the card and the form show them. */
export const METRIC_NAMES: readonly MetricName[] = Object.freeze([
  'views',
  'likes',
  'comments',
  'shares',
]);

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** A field the admin left empty: the form sends all four, filled or not. */
function isEmptyField(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}

/** The largest count an admin can type in, as the form's limit says. */
export const MAX_METRIC = 999_999_999;

const NOT_A_COUNT = 'Isi bilangan bulat 0 sampai 999.999.999';

function invalid(errors: Record<string, string>): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data performa tidak valid',
    errors,
  });
}

/**
 * A count: a JSON whole number from 0 to MAX_METRIC. Text is refused even when it reads as one,
 * so no parsing rule (exponents, hexadecimal, padding) can turn input into another number
 * (OWASP A05:2025).
 */
function isCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_METRIC
  );
}

/**
 * `{ views?, likes?, comments?, shares? }` as the link's four counts. Every refused field is
 * answered in one 422, keyed by its metric, so the form puts each message under its own field.
 */
export function checkManualPerformance(body: unknown): PerformanceMetrics {
  const fields = asObject(body);
  const metrics = {} as PerformanceMetrics;
  const errors: Record<string, string> = {};
  for (const name of METRIC_NAMES) {
    const value = fields[name];
    if (isEmptyField(value)) {
      metrics[name] = null;
    } else if (isCount(value)) {
      metrics[name] = value;
    } else {
      errors[name] = NOT_A_COUNT;
    }
  }
  if (Object.keys(errors).length > 0) {
    throw invalid(errors);
  }
  return metrics;
}
