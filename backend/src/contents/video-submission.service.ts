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
import { isLinkTaken, normalizeVideoLink } from './content-links.js';
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
        video_submitted_at: Date;
        approval_bypassed: boolean;
      };
    }) => Promise<{ count: number }>;
  };
  creators: {
    findUnique: (args: {
      where: { id: string };
      select: {
        first_name: true;
        middle_name: true;
        last_name: true;
        user_id: true;
      };
    }) => Promise<{
      first_name: string;
      middle_name: string | null;
      last_name: string | null;
      user_id: string;
    } | null>;
  };
  content_links: {
    create: (args: {
      data: {
        content_id: string;
        platform: social_platform;
        url: string;
        normalized_url: string;
        submitted_at: Date;
        submitted_by: string;
      };
    }) => Promise<unknown>;
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

/** The row moved between being read and being updated, so the status read says nothing now. */
const CONTENT_CHANGED =
  'Status konten ini baru saja berubah. Muat ulang lalu coba lagi';

// What opens the link for content in each status that task-actions.ts can refuse. H-1 skips
// an approval and never the draft, so before a draft the next step is the draft (PBI-7 7.2).
const NEXT_STEPS: Partial<Record<content_status, string>> = {
  scheduled: 'Kirim draft dulu sebelum mengirim link video',
  draft_revision: 'Kirim ulang draft dulu sebelum mengirim link video',
  draft_review:
    'Link video bisa dikirim setelah draft disetujui, atau mulai H-1 deadline',
  link_submitted: 'Link video untuk konten ini sudah dikirim',
};

function notEligible(message: string): ConflictException {
  return new ConflictException({ code: 'VIDEO_NOT_ELIGIBLE', message });
}

/** PBI-38 AC 5: one video belongs to one content only. */
function linkTaken(): ConflictException {
  return new ConflictException({
    code: 'VIDEO_LINK_TAKEN',
    message: 'Link ini sudah dipakai di konten lain',
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
   * Content Link Submitted. Eligibility, the status transition and the stored link happen inside
   * one transaction, so a refused link leaves the content as it was.
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

    // One reading of the clock: the content stores its day, the timeline event its moment.
    const now = new Date();
    const today = jakartaDay(now);

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
        throw notEligible(NEXT_STEPS[content.status] ?? CONTENT_CHANGED);
      }

      const submittedAt = new Date(`${today}T00:00:00.000Z`);

      // Conditional on the status that was read above: if another request changes the row
      // first, this update affects zero rows and only one submission can succeed. The bypass
      // flag comes from that same status, so it describes exactly the row the update matched.
      // The submitted day stays on the content: it is the first link's day (PBI-38 AC 7).
      const { count } = await transaction.contents.updateMany({
        where: {
          id: contentId,
          status: content.status,
        },
        data: {
          status: 'link_submitted',
          video_submitted_at: submittedAt,
          approval_bypassed: content.status !== 'draft_approved',
        },
      });

      if (count === 0) {
        throw notEligible(CONTENT_CHANGED);
      }

      const creator = await transaction.creators.findUnique({
        where: { id: creatorId },
        select: {
          first_name: true,
          middle_name: true,
          last_name: true,
          user_id: true,
        },
      });
      if (!creator) {
        throw new NotFoundException({
          code: 'CREATOR_NOT_FOUND',
          message: 'Kreator tidak ditemukan',
        });
      }

      // The link itself lives in content_links (PBI-38, 38.1). Its unique key refuses a video
      // already linked from another content, however the link was copied (OWASP A08:2025).
      try {
        await transaction.content_links.create({
          data: {
            content_id: contentId,
            platform,
            url: videoLink,
            normalized_url: normalizeVideoLink(videoLink),
            submitted_at: submittedAt,
            submitted_by: creator.user_id,
          },
        });
      } catch (error) {
        throw isLinkTaken(error) ? linkTaken() : error;
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
          // The moment, not the stored day: midnight would read 07.00 WIB and sort the link
          // under a draft or an approval from earlier the same day.
          occurred_at: now,
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
