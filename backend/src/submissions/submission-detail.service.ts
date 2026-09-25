import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

interface SubmissionDetailRow {
  id: string;
  content_id: string;
  link: string;
  contents: {
    brief: string;
    status: string;
    submissions: {
      revision_notes: string | null;
      updated_at: Date;
    }[];
  };
}

export interface SubmissionDetail {
  brief: string;
  link: string;
  status: string;
  revisionHistory: {
    note: string | null;
    date: string;
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
              },
            },
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: 'Draft tidak ditemukan',
      });
    }

    return {
      brief: submission.contents.brief,
      link: submission.link,
      status: submission.contents.status,
      revisionHistory: submission.contents.submissions.map((revision) => ({
        note: revision.revision_notes,
        date: revision.updated_at.toISOString(),
      })),
    };
  }
}
