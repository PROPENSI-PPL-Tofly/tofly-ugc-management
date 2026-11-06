import { REVIEWABLE_STATUSES } from './draft-review.js';
import { adminActor, type AdminActor } from '../contents/content-event-actors.js';
import { unauthenticated } from '../auth/creator-request.js';
import type { RevisedSubmission } from './dto/revised-submission.dto.js';
import type { RevisionRequest } from './revise-submission.js';
import type {
  RevisionStore,
  SubmissionUnderRevision,
} from './submission-revision.service.js';

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
      data: { revision_notes: string; revision_notes_html: string };
    }): Promise<{
      id: string;
      content_id: string;
      revision_notes: string | null;
      revision_notes_html: string | null;
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

  users?: {
    findUnique(args: {
      where: { id: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };

  revision_note_images?: {
    findMany(args: {
      where: { submission_id: string };
      select: { id: true; content_type: true };
      orderBy: [{ created_at: 'asc' }];
    }): Promise<{ id: string; content_type: string }[]>;
  };

  content_events?: {
    create(args: {
      data: AdminActor & {
        content_id: string;
        event_type: 'Revision Requested';
        occurred_at: Date;
        event_data: {
          revision_note: string;
          revision_note_html: string;
          images: { id: string; content_type: string }[];
        };
      };
    }): Promise<unknown>;
  };
}

interface RevisionPrismaClient extends SubmissionLookup {
  $transaction<T>(
    callback: (transaction: RevisionTransaction) => Promise<T>,
  ): Promise<T>;
}

export class SubmissionRevisionRepository implements RevisionStore {
  constructor(private readonly prisma: RevisionPrismaClient) {}

  async findById(
    submissionId: string,
  ): Promise<SubmissionUnderRevision | null> {
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
    input: RevisionRequest,
    adminUserId?: string,
  ): Promise<RevisedSubmission | null> {
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
          revision_notes: input.revisionNotes,
          revision_notes_html: input.revisionNotesHtml,
        },
      });

      if (adminUserId !== undefined) {
        if (
          !transaction.users ||
          !transaction.content_events ||
          !transaction.revision_note_images
        ) {
          throw new Error('Revision event recording requires event transaction delegates');
        }

        const admin = await transaction.users.findUnique({
          where: { id: adminUserId },
          select: { id: true },
        });
        if (!admin) throw unauthenticated();

        // The event records the note as it was sent, screenshots included (PBI-34): the
        // history shows what the creator saw even if an image is removed later.
        const images = await transaction.revision_note_images.findMany({
          where: { submission_id: submissionId },
          select: { id: true, content_type: true },
          orderBy: [{ created_at: 'asc' }],
        });

        await transaction.content_events.create({
          data: {
            content_id: submission.content_id,
            event_type: 'Revision Requested',
            ...adminActor(admin.id),
            occurred_at: new Date(),
            event_data: {
              revision_note: input.revisionNotes,
              revision_note_html: input.revisionNotesHtml,
              images,
            },
          },
        });
      }

      return {
        id: submission.id,
        contentId: submission.content_id,
        status: 'draft_revision',
        revisionNotes: submission.revision_notes,
        revisionNotesHtml: submission.revision_notes_html,
      };
    });
  }
}