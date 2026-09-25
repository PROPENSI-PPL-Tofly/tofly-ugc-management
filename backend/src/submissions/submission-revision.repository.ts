interface SubmissionLookup {
  submissions: {
    findUnique(args: {
      where: { id: string };
      select: {
        id: true;
        content_id: true;
        contents: {
          select: {
            status: true;
          };
        };
      };
    }): Promise<{
      id: string;
      content_id: string;
      contents: {
        status: string;
      };
    } | null>;
  };
}

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

interface RevisionPrismaClient extends SubmissionLookup {
  $transaction<T>(
    callback: (transaction: RevisionTransaction) => Promise<T>,
  ): Promise<T>;
}

export class SubmissionRevisionRepository {
  constructor(private readonly prisma: RevisionPrismaClient) {}

  async findById(submissionId: string): Promise<{
    id: string;
    content_id: string;
    status: string;
  } | null> {
    const submission = await this.prisma.submissions.findUnique({
      where: {
        id: submissionId,
      },
      select: {
        id: true,
        content_id: true,
        contents: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!submission) {
      return null;
    }

    return {
      id: submission.id,
      content_id: submission.content_id,
      status: submission.contents.status,
    };
  }

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