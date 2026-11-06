// What PATCH /submissions/:id/revise answers with, in API vocabulary rather than Prisma's.

export interface RevisedSubmission {
  id: string;
  contentId: string;
  status: 'draft_revision';
  revisionNotes: string | null;
  /** The note as sanitized rich text; null for one written before rich text existed (AC 9). */
  revisionNotesHtml: string | null;
}
