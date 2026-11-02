// How long a sync waits for a platform and how many it asks at once (PBI-27, 27.4).

/** A source that has not answered in time; the link is retried in the next run (AC 6). */
export class DeadlineExceeded extends Error {
  override readonly name = 'DeadlineExceeded';
}

/** The work's answer, or DeadlineExceeded once `ms` has passed. The timer never outlives it. */
export async function withDeadline<T>(
  work: Promise<T>,
  ms: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DeadlineExceeded(`no answer within ${ms} ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Each item's answer in its place, with at most `limit` running at once. */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}
