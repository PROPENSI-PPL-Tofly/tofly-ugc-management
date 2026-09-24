// Pure validation for adding one content item to a creator's already-active schedule
// (PBI-10, Content Plan's "Tambah Konten"). Kept apart from the modal so each rule is
// testable without rendering anything, same pattern as creator-form.ts.

import { getBufferWindow } from "./deadline-schedule";

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

  if (input.deadline === "") {
    errors.deadline = "Tanggal deadline wajib diisi";
    return errors;
  }

  // A non-empty string that still isn't a real date (e.g. "abc") parses to an Invalid Date;
  // every comparison against it is false, so the bound checks below would silently pass it.
  const deadline = new Date(`${input.deadline}T00:00:00Z`);
  if (Number.isNaN(deadline.getTime())) {
    errors.deadline = "Format tanggal deadline tidak valid";
    return errors;
  }

  // Same buffer rule generateDeadlineSchedule uses at onboarding (PRD 3.6): on/after
  // max(contract start, today) + buffer, and on/before the contract end date.
  const { firstAllowedDate } = getBufferWindow(input);
  const contractEnd = new Date(`${input.contractEnd}T00:00:00Z`);

  if (deadline < firstAllowedDate) {
    errors.deadline = `Deadline paling cepat ${firstAllowedDate.toISOString().slice(0, 10)}`;
  } else if (deadline > contractEnd) {
    errors.deadline = "Deadline tidak boleh setelah akhir kontrak";
  }

  return errors;
}
