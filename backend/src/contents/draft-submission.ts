import { UnprocessableEntityException } from '@nestjs/common';
import type { content_status } from '@prisma/client';

export interface DraftSubmission {
  link: string;
  /** Catatan untuk Admin; null when the creator left it out. */
  notes: string | null;
}

/** Room for a long share link; keeps a hostile body from filling submissions.link (text). */
export const MAX_DRAFT_LINK_LENGTH = 2048;
/** Room for a short message to the admin; matches the check on submissions.creator_notes. */
export const MAX_DRAFT_NOTES_LENGTH = 1000;

const WEB_PROTOCOLS = ['http:', 'https:'];

/** Where drafts are handed in: the one place the admin opens them from. */
const DRAFT_HOST = 'drive.google.com';

export const DRAFT_LINK_NOT_DRIVE =
  'Link draft harus dari Google Drive (drive.google.com)';

function isWebLink(link: string): boolean {
  return URL.canParse(link) && WEB_PROTOCOLS.includes(new URL(link).protocol);
}

/**
 * An https link whose host is exactly Google Drive. The URL parser finds the
 * host, so "drive.google.com@evil.example" or "drive.google.com.evil.example" never pass as
 * Drive (OWASP A10: the admin's browser opens whatever is stored here).
 */
function isDriveLink(link: string): boolean {
  const url = new URL(link);
  return url.protocol === 'https:' && url.hostname === DRAFT_HOST;
}

function checkLink(value: unknown): string | { error: string } {
  const link = typeof value === 'string' ? value.trim() : '';
  if (link === '') {
    return { error: 'Link draft wajib diisi' };
  }
  if (link.length > MAX_DRAFT_LINK_LENGTH) {
    return { error: `Link draft maksimal ${MAX_DRAFT_LINK_LENGTH} karakter` };
  }
  // The admin's Draft Preview opens this link, so only web links are kept (OWASP A03).
  if (!isWebLink(link)) {
    return { error: 'Link draft harus berupa URL http atau https' };
  }
  if (!isDriveLink(link)) {
    return { error: DRAFT_LINK_NOT_DRIVE };
  }
  return link;
}

function checkNotes(value: unknown): string | null | { error: string } {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return { error: 'Catatan harus berupa teks' };
  }
  const notes = value.trim();
  if (notes.length > MAX_DRAFT_NOTES_LENGTH) {
    return { error: `Catatan maksimal ${MAX_DRAFT_NOTES_LENGTH} karakter` };
  }
  return notes === '' ? null : notes;
}

/** The Submit/Resubmit Draft body (PRD 3.16), or a 422 naming every bad field. */
export function checkDraftSubmission(input: unknown): DraftSubmission {
  // A primitive or a list has no link or notes of its own, so it fails on those fields.
  const body = (input ?? {}) as Record<string, unknown>;

  const link = checkLink(body.link);
  const notes = checkNotes(body.notes);

  const errors: Record<string, string> = {};
  if (typeof link === 'object') {
    errors.link = link.error;
  }
  if (notes !== null && typeof notes === 'object') {
    errors.notes = notes.error;
  }

  if (Object.keys(errors).length > 0) {
    throw new UnprocessableEntityException({
      message: 'Data draft tidak valid',
      errors,
    });
  }

  return { link: link as string, notes: notes as string | null };
}

/**
 * Where a draft hand-in moves the content, or null when no draft is expected now. A first
 * draft waits for review; one sent after a revision request is draft_revised, which the review
 * queue lists first (see draft-review.ts).
 */
export function nextDraftStatus(
  status: content_status,
): 'draft_review' | 'draft_revised' | null {
  if (status === 'scheduled') {
    return 'draft_review';
  }
  if (status === 'draft_revision') {
    return 'draft_revised';
  }
  return null;
}
