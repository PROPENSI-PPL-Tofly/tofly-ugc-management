import {
  BadRequestException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { social_platform } from '@prisma/client';
import { CreatorLinkActor } from './link-change.js';
import { LinkChangeService, type LinkChanger } from './link-change.service.js';
import { checkPlatformLink } from './link-rules.js';
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

/** What the controller depends on, so the concrete service can be stubbed. */
export interface VideoSubmitter {
  submit(
    contentId: string,
    creatorId: string,
    input: VideoSubmission,
  ): Promise<SubmittedVideo>;
}

/**
 * The one-link form of `POST /contents/:id/video`, which Task Saya sends until the
 * multi-platform modal replaces it (PBI-38 38.3). It reads the platform off the link's host and
 * hands the link to the link service as the creator's only link (Adapter), so both routes share
 * every rule: the window, the invoice lock, the accounts on file and the one-video key.
 */
@Injectable()
export class VideoSubmissionService implements VideoSubmitter {
  constructor(
    @Inject(LinkChangeService)
    private readonly links: LinkChanger,
  ) {}

  async submit(
    contentId: string,
    creatorId: string,
    input: VideoSubmission,
  ): Promise<SubmittedVideo> {
    const platform = detectVideoPlatform(input.videoLink);
    if (!platform) {
      throw new BadRequestException({
        code: 'INVALID_VIDEO_LINK',
        message: 'Link harus berupa URL Instagram atau TikTok',
      });
    }
    const checked = checkPlatformLink(platform, input.videoLink);
    if ('error' in checked) {
      throw new UnprocessableEntityException({
        message: 'Data link video tidak valid',
        errors: { videoLink: checked.error },
      });
    }

    const result = await this.links.submit(
      contentId,
      new CreatorLinkActor(creatorId),
      [{ platform, url: checked.url }],
    );
    return {
      contentId,
      status: result.status,
      videoLink: checked.url,
      platform,
      submittedAt: `${result.submittedAt}T00:00:00.000Z`,
    };
  }
}
