export class SubmissionRevisionRepository {
  constructor(private readonly prisma: any) {}

  async saveRevision(
    _submissionId: string,
    _contentId: string,
    _revisionNotes: string,
  ): Promise<unknown> {
    throw new Error('Revision persistence is not implemented yet');
  }
}