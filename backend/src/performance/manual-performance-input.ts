// The body of PUT /contents/:id/links/:platform/performance (PBI-27 27.1, AC 15), checked at the
// HTTP boundary so the rest of manual entry only ever sees four numbers or nulls.

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

/** `{ views?, likes?, comments?, shares? }` as the link's four counts. */
export function checkManualPerformance(body: unknown): PerformanceMetrics {
  const fields = asObject(body);
  const metrics = {} as PerformanceMetrics;
  for (const name of METRIC_NAMES) {
    const value = fields[name];
    metrics[name] = isEmptyField(value) ? null : (value as number);
  }
  return metrics;
}
