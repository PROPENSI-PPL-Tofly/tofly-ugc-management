/** One query's share of a page. */
export interface Slice {
  skip: number;
  take: number;
}

/**
 * Where one page of a list made of two back-to-back segments comes from, e.g. open tasks
 * followed by finished ones. Each segment is its own ordered query, so a list can put one group
 * wholly after the other and still order both by the same column, which a single ORDER BY on
 * the columns alone cannot. A null slice means that segment adds nothing to this page.
 */
export function pageAcrossSegments(
  skip: number,
  take: number,
  firstCount: number,
): { first: Slice | null; second: Slice | null } {
  const fromFirst = Math.max(0, Math.min(take, firstCount - skip));
  const fromSecond = take - fromFirst;

  return {
    first: fromFirst > 0 ? { skip, take: fromFirst } : null,
    second:
      fromSecond > 0
        ? { skip: Math.max(0, skip - firstCount), take: fromSecond }
        : null,
  };
}
