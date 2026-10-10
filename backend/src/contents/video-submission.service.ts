import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { content_status, social_platform } from '@prisma/client';
import { jakartaDay } from '../creators/evergreen.js';
import { canSubmitVideo } from '../me/task-actions.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { COMMITTED_STATUSES } from './content-lifecycle.js';
import {
  detectVideoPlatform,
  type VideoSubmission,
} from './video-submission.js';

export interface SubmittedVideo {
  contentId: string;
  status: 'link_submitted';
  videoLink: string;
  platform: social_platform;
  submittedAt: string;
}

/** The slice of Prisma used by final-video submission, so unit tests can stub it exactly. */
export interface VideoSubmissionTransaction {
  contents: {
    findFirst: (args: {
      where: {
        id: string;
        status: { in: content_status[] };
        contracts: { creator_id: string };
      };
      select: {
        id: true;
        status: true;
        deadline: true;
      };
    }) => Promise<{
      id: string;
      status: content_status;
      deadline: Date;
    } | null>;
    updateMany: (args: {
      where: {
        id: string;
        status: content_status;
      };
      data: {
        status: 'link_submitted';
        video_link: string;
        video_submitted_at: Date;
        platform: social_platform;
        approval_bypassed: boolean;
      };
    }) => Promise<{ count: number }>;
  };
  creators: {
    findUnique: (args: {
      where: { id: string };
      select: { first_name: true; middle_name: true; last_name: true };
    }) => Promise<{
      first_name: string;
      middle_name: string | null;
      last_name: string | null;
    } | null>;
  };
  content_events: {
    create: (args: {
      data: {
        content_id: string;
        event_type: 'Link Submitted';
        actor_name: string;
        actor_role: 'creator';
        occurred_at: Date;
        event_data: { link: string };
      };
    }) => Promise<unknown>;
  };
}

export interface VideoSubmissionClient {
  $transaction<T>(
    work: (transaction: VideoSubmissionTransaction) => Promise<T>,
  ): Promise<T>;
}

/** What the controller depends on, so the concrete persistence service can be stubbed. */
export interface VideoSubmitter {
  submit(
    contentId: string,
    creatorId: string,
    input: VideoSubmission,
  ): Promise<SubmittedVideo>;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function notEligible(status: content_status): ConflictException {
  return new ConflictException({
    code: 'VIDEO_NOT_ELIGIBLE',
    message:
      status === 'link_submitted'
        ? 'Link video untuk konten ini sudah dikirim'
        : 'Link video hanya bisa dikirim setelah draft disetujui atau mulai H-1',
  });
}

@Injectable()
export class VideoSubmissionService implements VideoSubmitter {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: VideoSubmissionClient,
  ) {}

  /**
   * Submits the creator's final Instagram/TikTok link and immediately moves the content to
   * Content Link Submitted. Eligibility and the status transition happen inside one transaction.
   */
  async submit(
    contentId: string,
    creatorId: string,
    input: VideoSubmission,
  ): Promise<SubmittedVideo> {
    const videoLink = input.videoLink.trim();
    const platform = detectVideoPlatform(videoLink);

    if (!platform) {
      throw new BadRequestException({
        code: 'INVALID_VIDEO_LINK',
        message: 'Link harus berupa URL Instagram atau TikTok',
      });
    }

    const today = jakartaDay(new Date());

    return this.prisma.$transaction(async (transaction) => {
      // Scope the lookup to the caller's own committed content. Another creator's content and
      // a proposal are indistinguishable from a missing content to the caller (OWASP A01).
      const content = await transaction.contents.findFirst({
        where: {
          id: contentId,
          status: { in: [...COMMITTED_STATUSES] },
          contracts: { creator_id: creatorId },
        },
        select: {
          id: true,
          status: true,
          deadline: true,
        },
      });

      if (!content) {
        throw new NotFoundException({
          code: 'CONTENT_NOT_FOUND',
          message: 'Konten tidak ditemukan',
        });
      }

      if (!canSubmitVideo(content.status, isoDay(content.deadline), today)) {
        throw notEligible(content.status);
      }

      const submittedAt = new Date(`${today}T00:00:00.000Z`);

      // Conditional on the status that was read above: if another request changes the row
      // first, this update affects zero rows and only one submission can succeed. The bypass
      // flag comes from that same status, so it describes exactly the row the update matched.
      const { count } = await transaction.contents.updateMany({
        where: {
          id: contentId,
          status: content.status,
        },
        data: {
          status: 'link_submitted',
          video_link: videoLink,
          video_submitted_at: submittedAt,
          platform,
          approval_bypassed: content.status !== 'draft_approved',
        },
      });

      if (count === 0) {
        throw notEligible(content.status);
      }

      const creator = await transaction.creators.findUnique({
        where: { id: creatorId },
        select: { first_name: true, middle_name: true, last_name: true },
      });
      if (!creator) {
        throw new NotFoundException({
          code: 'CREATOR_NOT_FOUND',
          message: 'Kreator tidak ditemukan',
        });
      }

      await transaction.content_events.create({
        data: {
          content_id: contentId,
          event_type: 'Link Submitted',
          actor_name: [
            creator.first_name,
            creator.middle_name,
            creator.last_name,
          ]
            .filter(Boolean)
            .join(' '),
          actor_role: 'creator',
          occurred_at: submittedAt,
          event_data: { link: videoLink },
        },
      });

      return {
        contentId,
        status: 'link_submitted',
        videoLink,
        platform,
        submittedAt: submittedAt.toISOString(),
      };
    });
  }
}
