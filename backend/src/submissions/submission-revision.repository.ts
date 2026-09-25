interface RevisionTransaction {
  submissions: {
    update(args: {
      where: { id: string };
      data: { revision_notes: string };
    }): Promise<{
      id: string;
      content_id: string;
      revision_notes: string | null;
    }>;
  };

  contents: {
    update(args: {
      where: { id: string };
      data: { status: 'draft_revision' };
    }): Promise<{
      id: string;
      status: string;
    }>;
  };
}

interface RevisionPrismaClient {
  $transaction<T>(
    callback: (transaction: RevisionTransaction) => Promise<T>,
  ): Promise<T>;
}

export class SubmissionRevisionRepository {
  constructor(private readonly prisma: RevisionPrismaClient) {}

  async saveRevision(
    submissionId: string,
    contentId: string,
    revisionNotes: string,
  ): Promise<{
    id: string;
    status: string;
    revisionNotes: string | null;
  }> {
    return this.prisma.$transaction(async (transaction) => {
      const submission = await transaction.submissions.update({
        where: {
          id: submissionId,
        },
        data: {
          revision_notes: revisionNotes,
        },
      });

      await transaction.contents.update({
        where: {
          id: contentId,
        },
        data: {
          status: 'draft_revision',
        },
      });

      return {
        id: submission.id,
        status: 'draft_revision',
        revisionNotes: submission.revision_notes,
      };
    });
  }
}