// What PATCH /submissions/:id/approve answers with, in API vocabulary rather than Prisma's.

export interface ApprovedSubmission {
  id: string;
  contentId: string;
  status: 'draft_approved';
}
