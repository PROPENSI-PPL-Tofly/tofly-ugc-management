// How the page reads the acting Admin the API names (PBI-23, 23.11). The backend decides the name
// (the account's name, else its email); this only guards the answer, so an older or drifted one
// reads as "no name" and the step says "Admin".

/** What a step says when no account is named. */
export const ADMIN_LABEL = "Admin";

/** The name the API gave, trimmed; undefined for anything that is not a name. */
export function readActorName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim() || undefined;
}
