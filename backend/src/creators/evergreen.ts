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
