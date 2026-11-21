import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentCreator } from '../auth/current-creator.decorator.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { CreatorLinkActor, type ContentLinksResult } from './link-change.js';
import { LinkChangeService, type LinkChanger } from './link-change.service.js';
import { checkLinkReplacement, checkLinkSubmission } from './link-request.js';

/** A content's video links, one per platform (PBI-38 38.2). */
@Controller('contents')
export class ContentLinksController {
  constructor(
    @Inject(LinkChangeService)
    private readonly links: LinkChanger,
  ) {}

  /**
   * The creator hands in one or more platform links: the first move the content to Link Dikirim,
   * a later one only adds its platform (AC 3-8). Every refused field is answered in one 422.
   */
  @Post(':id/links')
  @UseGuards(DevCreatorGuard)
  submit(
    @Param('id', new ParseUUIDPipe()) contentId: string,
    @CurrentCreator() creatorId: string,
    @Body() body: unknown,
  ): Promise<ContentLinksResult> {
    return this.links.submit(
      contentId,
      new CreatorLinkActor(creatorId),
      checkLinkSubmission(body),
    );
  }

  /**
   * The creator puts another link in place of one platform's link (AC 9). Only the creator adds
   * or changes their links; an admin reads them and fills the numbers in, never the link.
   */
  @Put(':id/links/:platform')
  @UseGuards(DevCreatorGuard)
  replace(
    @Param('id', new ParseUUIDPipe()) contentId: string,
    @Param('platform') platform: string,
    @CurrentCreator() creatorId: string,
    @Body() body: unknown,
  ): Promise<ContentLinksResult> {
    return this.links.replace(
      contentId,
      new CreatorLinkActor(creatorId),
      checkLinkReplacement(platform, body),
    );
  }
}
