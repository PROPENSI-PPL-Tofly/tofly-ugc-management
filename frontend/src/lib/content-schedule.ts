// Pure validation for adding one content item to a creator's already-active schedule
// (PBI-10, Content Plan's "Tambah Konten"). Kept apart from the modal so each rule is
// testable without rendering anything, same pattern as creator-form.ts.

export type ContentType = "evergreen" | "specific";

export interface EvergreenSlotInput {
  contentType: ContentType;
  contractStart: string;
  contractEnd: string;
  today: string;
  bufferDays: number;
  contentQuota: number;
  /** How many Evergreen items are already scheduled this contract period. */
  evergreenScheduledCount: number;
  deadline: string;
}

export interface EvergreenSlotErrors {
  contentType?: string;
  deadline?: string;
}

export function validateEvergreenSlot(input: EvergreenSlotInput): EvergreenSlotErrors {
  const errors: EvergreenSlotErrors = {};

  // Specific content is never counted against the Evergreen quota (PRD 3.4/3.7), so this
  // check only applies when Evergreen itself is being added.
  if (input.contentType === "evergreen" && input.evergreenScheduledCount >= input.contentQuota) {
    errors.contentType = "Slot Evergreen sudah penuh";
  }

  return errors;
}
