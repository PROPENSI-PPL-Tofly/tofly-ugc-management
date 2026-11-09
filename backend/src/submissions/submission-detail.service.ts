import { Inject, Injectable } from '@nestjs/common';
import { joinName } from '../creators/evergreen.js';
import { ADMIN_ACTOR_NAME } from '../contents/content-event-actors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { FollowUpDto } from './follow-up.service.js';
import { submissionNotFound } from './review-errors.js';

interface SubmissionDetailRow {
  id: string;
  content_id: string;
  link: string;
  contents: {
    name: string;
    type: 'evergreen' | 'specific';
    deadline: Date;
    contracts: {
      creators: {
        first_name: string;
        middle_name: string | null;
        last_name: string | null;
      };
    };
    brief: string;
    status: string;
    submissions: {
      revision_notes: string | null;
      updated_at: Date;
      revision_followups: { id: string; body: string; created_at: Date }[];
    }[];
  };
}

export interface SubmissionDetail {
  contentName: string;
  creatorName: string;
  /** ISO calendar day. */
  deadline: string;
  type: 'evergreen' | 'specific';
  brief: string;
  link: string;
  status: string;
  revisionHistory: {
    note: string | null;
    date: string;
    // PBI-33 AC 4: what the admin added under this note, oldest first.
    followUps: FollowUpDto[];
  }[];
}

export interface SubmissionDetailClient {
  submissions: {
    findUnique: (args: {
      where: { id: string };
      select: {
        id: true;
        content_id: true;
        link: true;
        contents: {
          select: {
            name: true;
            type: true;
            deadline: true;
            contracts: {
              select: {
                creators: {
                  select: {
                    first_name: true;
                    middle_name: true;
                    last_name: true;
                  };
                };
              };
            };
            brief: true;
            status: true;
            submissions: {
              where: {
                revision_notes: {
                  not: null;
                };
              };
              orderBy: [{ updated_at: 'asc' }, { id: 'asc' }];
              select: {
                revision_notes: true;
                updated_at: true;
                revision_followups: {
                  orderBy: [{ created_at: 'asc' }, { id: 'asc' }];
                  select: { id: true; body: true; created_at: true };
                };
              };
            };
          };
        };
      };
    }) => Promise<SubmissionDetailRow | null>;
  };
}

@Injectable()
export class SubmissionDetailService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: SubmissionDetailClient,
  ) {}

  async getDetail(id: string): Promise<SubmissionDetail> {
    const submission = await this.prisma.submissions.findUnique({
      where: { id },
      select: {
        id: true,
        content_id: true,
        link: true,
        contents: {
          select: {
            name: true,
            type: true,
            deadline: true,
            contracts: {
              select: {
                creators: {
                  select: {
                    first_name: true,
                    middle_name: true,
                    last_name: true,
                  },
                },
              },
            },
            brief: true,
            status: true,
            submissions: {
              where: {
                revision_notes: {
                  not: null,
                },
              },
              orderBy: [{ updated_at: 'asc' }, { id: 'asc' }],
              select: {
                revision_notes: true,
                updated_at: true,
                revision_followups: {
                  orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
                  select: { id: true, body: true, created_at: true },
                },
              },
            },
          },
        },
      },
    });

    if (!submission) {
      throw submissionNotFound();
    }

    return {
      contentName: submission.contents.name,
      creatorName: joinName(submission.contents.contracts.creators),
      deadline: submission.contents.deadline.toISOString().slice(0, 10),
      type: submission.contents.type,
      brief: submission.contents.brief,
      link: submission.link,
      status: submission.contents.status,
      revisionHistory: submission.contents.submissions.map((revision) => ({
        note: revision.revision_notes,
        date: revision.updated_at.toISOString(),
        followUps: revision.revision_followups.map((followUp) => ({
          id: followUp.id,
          note: followUp.body,
          at: followUp.created_at.toISOString(),
          actor: { name: ADMIN_ACTOR_NAME },
        })),
      })),
    };
  }
}
