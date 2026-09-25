import { REVIEWABLE_STATUSES } from './draft-review.js';

type ReviewableStatus = (typeof REVIEWABLE_STATUSES)[number];

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
            submissions: {
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }];
              take: 1;
              select: {
                id: true;
              };
            };
          };
        };
      };
    }): Promise<{
      id: string;
      content_id: string;
      contents: {
        status: string;
        submissions: {
          id: string;
        }[];
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
    updateMany(args: {
      where: {
        id: string;
        status: {
          in: ReviewableStatus[];
        };
      };
      data: {
        status: 'draft_revision';
      };
    }): Promise<{
      count: number;
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
    isLatest: boolean;
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
            submissions: {
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
              take: 1,
              select: {
                id: true,
              },
            },
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
      isLatest: submission.contents.submissions[0]?.id === submission.id,
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
  } | null> {
    return this.prisma.$transaction(async (transaction) => {
      const { count } = await transaction.contents.updateMany({
        where: {
          id: contentId,
          status: {
            in: [...REVIEWABLE_STATUSES],
          },
        },
        data: {
          status: 'draft_revision',
        },
      });

      if (count === 0) {
        return null;
      }

      const submission = await transaction.submissions.update({
        where: {
          id: submissionId,
        },
        data: {
          revision_notes: revisionNotes,
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