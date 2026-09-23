// Pure rules for onboarding a creator: how their Evergreen contents are named and which
// deadlines the server accepts. Nothing here touches Nest or Prisma, so every rule is tested
// without a database and the persistence code only has to wire the results together.

/**
 * `Evg_<NameWithoutSpaces>_DDMMYYYY`, the name the admin screens already use for
 * auto-scheduled Evergreen content. `day` is an ISO calendar day (`YYYY-MM-DD`); it is split
 * as text so the name never depends on the server's timezone.
 */
export function evergreenName(fullName: string, day: string): string {
  const [year, month, date] = day.split('-');
  return `Evg_${fullName.replace(/\s+/g, '')}_${date}${month}${year}`;
}

export interface NameParts {
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
}

/**
 * The Add Creator form collects one name; the creators table keeps three columns. The first
 * word is the first name, the last word the last name, and anything between stays together
 * as the middle name so no part of a long Indonesian name is dropped.
 */
export function splitName(fullName: string): NameParts {
  const words = fullName.trim().split(/\s+/);
  if (words.length === 1) {
    return { first_name: words[0], middle_name: null, last_name: null };
  }
  return {
    first_name: words[0],
    middle_name: words.length > 2 ? words.slice(1, -1).join(' ') : null,
    last_name: words[words.length - 1],
  };
}
