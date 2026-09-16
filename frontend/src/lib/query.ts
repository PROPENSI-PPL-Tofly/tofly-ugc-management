/**
 * Applies changes to the current query string.
 *
 * Two rules are baked in because every caller wants them. A parameter set to an empty value
 * is removed rather than written as `key=`, so a cleared filter leaves a clean URL. And any
 * change other than the page itself resets paging: after narrowing a filter, page four of
 * the old result set is almost never where the reader wants to land, and is often past the
 * end of the new one.
 */
export function updateQuery(
  current: string | URLSearchParams,
  changes: Record<string, string>,
): string {
  const params = new URLSearchParams(current);

  for (const [key, value] of Object.entries(changes)) {
    if (value === "" || (key === "page" && value === "1")) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  if (!("page" in changes)) params.delete("page");

  return params.toString();
}
