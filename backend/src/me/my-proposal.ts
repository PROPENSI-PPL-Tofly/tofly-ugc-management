import { UnprocessableEntityException } from '@nestjs/common';
import { isCalendarDay } from '../creators/evergreen.js';
import { DeadlineWindow } from '../deadline-buffer/deadline-window.js';

// The rules of a creator proposing a Specific content (PBI-14, 14.1) that need no database: what
// the form may send and which deadlines the contract leaves open. Kept apart from the service so
// each rule is tested without Nest or Prisma, and re-run on the server since a request can skip
// the form entirely.

/** The name of the content, as long as an admin may give one (MAX_CONTENT_NAME_LENGTH). */
export const MAX_PROPOSAL_NAME_LENGTH = 100;
/** Room for a brief of a few paragraphs; an admin's own limit is wider (MAX_BRIEF_LENGTH). */
export const MAX_PROPOSAL_BRIEF_LENGTH = 1000;
/** The optional notes for the admin. */
export const MAX_PROPOSAL_NOTES_LENGTH = 500;

/** What "Ajukan Konten" sends, already checked and trimmed. */
export interface NewProposal {
  name: string;
  brief: string;
  /** YYYY-MM-DD */
  deadline: string;
  /** Null when the creator left them out. */
  notes: string | null;
}

type ProposalErrors = Partial<Record<keyof NewProposal, string>>;

function refused(errors: ProposalErrors): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data pengajuan tidak valid',
    errors,
  });
}

/** Characters as the form's counter counts them: one for a character outside the basic plane. */
function lengthOf(text: string): number {
  return [...text].length;
}

function trimmedText(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

/**
 * Narrows the body once, at the edge. A body that is not an object reads as an empty form, so the
 * answer is the same per-field 422 and never a TypeError (OWASP A03).
 */
export function checkNewProposal(input: unknown): NewProposal {
  const body: Record<string, unknown> =
    input !== null && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const errors: ProposalErrors = {};

  const name = trimmedText(body.name);
  if (!name) {
    errors.name = 'Nama konten wajib diisi';
  } else if (lengthOf(name) > MAX_PROPOSAL_NAME_LENGTH) {
    errors.name = `Nama konten maksimal ${MAX_PROPOSAL_NAME_LENGTH} karakter`;
  }

  const brief = trimmedText(body.brief);
  if (!brief) {
    errors.brief = 'Brief wajib diisi';
  } else if (lengthOf(brief) > MAX_PROPOSAL_BRIEF_LENGTH) {
    errors.brief = `Brief maksimal ${MAX_PROPOSAL_BRIEF_LENGTH} karakter`;
  }

  const { deadline } = body;
  if (typeof deadline !== 'string' || deadline === '') {
    errors.deadline = 'Deadline wajib diisi';
  } else if (!isCalendarDay(deadline)) {
    errors.deadline = 'Format deadline tidak valid';
  }

  let notes: string | null = null;
  if (body.notes !== undefined && body.notes !== null) {
    const text = trimmedText(body.notes);
    if (text === null) {
      errors.notes = 'Catatan harus berupa teks';
    } else if (lengthOf(text) > MAX_PROPOSAL_NOTES_LENGTH) {
      errors.notes = `Catatan maksimal ${MAX_PROPOSAL_NOTES_LENGTH} karakter`;
    } else {
      notes = text === '' ? null : text;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw refused(errors);
  }
  return {
    name: name as string,
    brief: brief as string,
    deadline: deadline as string,
    notes,
  };
}

/** The contract the deadline is judged against, its days as YYYY-MM-DD. */
export interface ProposalContract {
  startDate: string;
  endDate: string;
}

/**
 * Why a proposed deadline is refused, or null when the window holds it (AC 2): from the later of
 * the contract start and today plus the stored buffer, up to the contract end less the same
 * buffer. It asks the same DeadlineWindow as Tambah Konten and an edit, so no two entry points
 * can draw the line apart (PBI-23 AC 22).
 */
export function proposalDeadlineError(
  contract: ProposalContract,
  deadline: string,
  today: string,
  bufferDays: number,
): string | null {
  const window = DeadlineWindow.of({
    contractStart: contract.startDate,
    contractEnd: contract.endDate,
    today,
    bufferDays,
  });
  // The buffer can leave no day at all in a short contract: say so, rather than naming a day
  // that is too early and a day that is too late at once.
  if (window.earliest > window.latest) {
    return 'Tidak ada tanggal deadline yang tersedia di kontrak ini';
  }
  return window.problem(deadline) ?? null;
}
