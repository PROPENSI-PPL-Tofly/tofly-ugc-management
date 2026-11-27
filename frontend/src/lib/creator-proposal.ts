// "Ajukan Konten" (PBI-14, 14.2): a creator proposes a Specific content idea from Task Saya. Pure
// module, no fetch and no clock, so the form, its server loader and the tests share one set of
// rules. The deadline window is the same one Tambah Konten draws (PBI-23's buffer), and the API
// (14.1) judges every proposal again, so these checks only spare the creator a round trip.

import type { CreatorInvoice } from "./creator-invoice";
import { getBufferWindow } from "./deadline-schedule";
import { formatDate } from "./format";
import { latestDeadline } from "./platform-links";

/** AC 1: the longest name, brief and notes a proposal takes. */
export const PROPOSAL_NAME_MAX = 100;
export const PROPOSAL_BRIEF_MAX = 1000;
export const PROPOSAL_NOTES_MAX = 500;

/** The days a proposed deadline may fall on, both included, as YYYY-MM-DD. */
export interface ProposalWindow {
  first: string;
  last: string;
}

/** What the creator types in the form, as typed. */
export interface ProposalFields {
  name: string;
  brief: string;
  deadline: string;
  notes: string;
}

/** One message per field that is not right yet (AC 1, AC 2). */
export type ProposalErrors = Partial<Record<keyof ProposalFields, string>>;

/** What POST /me/contents/proposals is sent: trimmed text, and no notes as null. */
export interface ProposalBody {
  name: string;
  brief: string;
  deadline: string;
  notes: string | null;
}

/**
 * AC 2: from the later of the contract start and today plus the buffer, up to the contract end
 * minus the same buffer (H-n). Null when no day is left between the two lines.
 */
export function proposalWindow(input: {
  periodStart: string;
  periodEnd: string;
  today: string;
  bufferDays: number;
}): ProposalWindow | null {
  const first = getBufferWindow({
    contractStart: input.periodStart,
    today: input.today,
    bufferDays: input.bufferDays,
  })
    .firstAllowedDate.toISOString()
    .slice(0, 10);
  const last = latestDeadline(input.periodEnd, input.bufferDays);

  return first <= last ? { first, last } : null;
}

/** "Pilih antara 21 Nov 2026 dan 26 Des 2026", the tooltip's and the error's words (AC 2). */
export function proposalWindowLabel(window: ProposalWindow): string {
  return `Pilih antara ${formatDate(window.first)} dan ${formatDate(window.last)}`;
}

/**
 * AC 3: the contract a creator may propose under, the running one that today falls in. Nothing
 * for a contract that has ended, has not started or whose invoice is past running; the API
 * refuses those with 403 anyway.
 */
export function proposalContract(
  invoices: readonly CreatorInvoice[],
  today: string,
): { periodStart: string; periodEnd: string } | null {
  // A creator's periods never overlap (PBI-30), so at most one contract holds today.
  const running = invoices.find(
    (invoice) =>
      invoice.status === "accruing" &&
      !invoice.notStarted &&
      invoice.periodStart <= today &&
      today <= invoice.periodEnd,
  );

  return running ? { periodStart: running.periodStart, periodEnd: running.periodEnd } : null;
}

/** The window the form opens on, or null when the creator may not propose today. */
export function proposalWindowFor(
  invoices: readonly CreatorInvoice[],
  today: string,
  bufferDays: number,
): ProposalWindow | null {
  const contract = proposalContract(invoices, today);
  return contract ? proposalWindow({ ...contract, today, bufferDays }) : null;
}

/** AC 1 and AC 2, in the prototype's words; an empty object when the proposal may be sent. */
export function checkProposal(fields: ProposalFields, window: ProposalWindow): ProposalErrors {
  const errors: ProposalErrors = {};

  if (fields.name.trim() === "") errors.name = "Nama konten wajib diisi";
  else if (fields.name.length > PROPOSAL_NAME_MAX) errors.name = "Nama konten maksimal 100 karakter";

  if (fields.brief.trim() === "") errors.brief = "Brief wajib diisi";
  else if (fields.brief.length > PROPOSAL_BRIEF_MAX) errors.brief = "Brief maksimal 1.000 karakter";

  if (fields.deadline === "") errors.deadline = "Pilih deadline";
  else if (fields.deadline < window.first || fields.deadline > window.last) {
    errors.deadline = proposalWindowLabel(window);
  }

  if (fields.notes.length > PROPOSAL_NOTES_MAX) errors.notes = "Catatan maksimal 500 karakter";

  return errors;
}

/** The request body: trimmed text, and notes left blank sent as null rather than "". */
export function toProposalBody(fields: ProposalFields): ProposalBody {
  const notes = fields.notes.trim();
  return {
    name: fields.name.trim(),
    brief: fields.brief.trim(),
    deadline: fields.deadline,
    notes: notes === "" ? null : notes,
  };
}
