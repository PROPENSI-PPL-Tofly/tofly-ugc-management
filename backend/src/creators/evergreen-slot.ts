// Pure rules for adding ONE content item to a creator's already-active schedule (PBI-10's
// "Tambah Konten"), re-run on the server since a request can skip the client entirely. Kept
// apart from evergreen.ts, which validates the whole deadline batch at onboarding — this
// judges a single new slot against the quota that batch already used up.

export type ContentType = 'evergreen' | 'specific';

const CONTENT_TYPES: ContentType[] = ['evergreen', 'specific'];

/** The creator's existing contract, as already stored — not raw request input. */
export interface EvergreenSlotContext {
  contractStart: string;
  contractEnd: string;
  contentQuota: number;
  /** How many Evergreen contents this contract period already has. */
  evergreenScheduledCount: number;
}

export type EvergreenSlotErrors = Partial<Record<'contentType' | 'deadline', string>>;

/**
 * `contentType` and `deadline` are the raw Tambah Konten body fields, taken as `unknown`
 * since a request can send anything; `context` is the creator's contract as already stored.
 */
export function checkEvergreenSlot(
  contentType: unknown,
  deadline: unknown,
  context: EvergreenSlotContext,
  today: string,
): EvergreenSlotErrors {
  const errors: EvergreenSlotErrors = {};

  // Specific content is never counted against the Evergreen quota (PRD 3.4/3.7), so this
  // only applies once we know Evergreen itself is actually being added.
  if (!CONTENT_TYPES.includes(contentType as ContentType)) {
    errors.contentType = 'Tipe konten harus evergreen atau specific';
  } else if (
    contentType === 'evergreen' &&
    context.evergreenScheduledCount >= context.contentQuota
  ) {
    errors.contentType = 'Slot Evergreen sudah penuh';
  }

  return errors;
}
