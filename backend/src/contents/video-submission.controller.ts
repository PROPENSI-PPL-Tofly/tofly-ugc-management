import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentCreator } from '../auth/current-creator.decorator.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import {
  checkVideoSubmission,
  type VideoSubmission,
} from './video-submission.js';
import {
  VideoSubmissionService,
  type SubmittedVideo,
  type VideoSubmitter,
} from './video-submission.service.js';

function extractVideoLink(body: unknown): unknown {
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    return (body as Record<string, unknown>).link;
  }

  return undefined;
}

@Controller('contents')
@UseGuards(DevCreatorGuard)
export class VideoSubmissionController {
  constructor(
    @Inject(VideoSubmissionService)
    private readonly videos: VideoSubmitter,
  ) {}

  /**
   * Submit the final published video link from Task Saya.
   *
   * The HTTP contract uses `link`; the validated internal service contract
   * uses `videoLink`.
   */
  @Post(':id/video')
  async submit(
    @Param('id', new ParseUUIDPipe()) contentId: string,
    @CurrentCreator() creatorId: string,
    @Body() body: unknown,
  ): Promise<SubmittedVideo> {
    const validated: VideoSubmission = checkVideoSubmission({
      videoLink: extractVideoLink(body),
    });

    return this.videos.submit(contentId, creatorId, validated);
  }
}
