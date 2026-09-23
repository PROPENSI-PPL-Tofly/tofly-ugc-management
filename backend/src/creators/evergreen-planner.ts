/** One Evergreen content item to create for a new contract period. */
export interface EvergreenItem {
  name: string;
  deadline: Date;
}

/** DDMMYYYY of a midnight-UTC calendar day. */
function ddmmyyyy(day: Date): string {
  const [year, month, date] = day.toISOString().slice(0, 10).split('-');
  return `${date}${month}${year}`;
}

/**
 * PRD 3.4: one Evergreen item per allocated slot, titled Evg_[sequence]_[CreatorName]_DDMMYYYY,
 * with sequence numbers from 1 in deadline order. The number is permanent once saved, which
 * is why it is assigned here, at creation, rather than derived when the plan is read.
 */
export function planEvergreen(
  creatorName: string,
  deadlines: Date[],
): EvergreenItem[] {
  return [...deadlines]
    .sort((a, b) => a.getTime() - b.getTime())
    .map((deadline, index) => ({
      name: `Evg_${index + 1}_${creatorName}_${ddmmyyyy(deadline)}`,
      deadline,
    }));
}
