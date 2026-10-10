// One place that says what an id looks like, for every check that has to refuse anything else
// before it reaches a `uuid` column or a lookup.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value is text in the 8-4-4-4-12 hexadecimal form of a UUID, and nothing more. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
