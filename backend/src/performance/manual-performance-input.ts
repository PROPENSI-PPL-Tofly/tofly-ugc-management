// The body of PUT /contents/:id/links/:platform/performance (PBI-27 27.1, AC 15), checked at the
// HTTP boundary so the rest of manual entry only ever sees four numbers or nulls.

export type MetricName = 'views' | 'likes' | 'comments' | 'shares';

/** A link's four counts; null is "no data yet", never 0 (AC 2). */
export type PerformanceMetrics = Record<MetricName, number | null>;

export function checkManualPerformance(_body: unknown): PerformanceMetrics {
  throw new Error('not implemented');
}
