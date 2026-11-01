import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AdminRequest } from '../auth/admin.guard.js';
import { CreatorOrAdminGuard } from '../auth/creator-or-admin.guard.js';
import { CurrentCreator } from '../auth/current-creator.decorator.js';
import type { CreatorRequest } from '../auth/creator-request.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import {
  AdminLinkActor,
  CreatorLinkActor,
  type ContentLinksResult,
  type LinkActor,
} from './link-change.js';
import { LinkChangeService, type LinkChanger } from './link-change.service.js';
import { checkLinkReplacement, checkLinkSubmission } from './link-request.js';

/** Who the guard let in: a creator's request carries their creator id, an admin's only a principal. */
function actorOf(
  request: Pick<CreatorRequest, 'creatorId'> & Pick<AdminRequest, 'principal'>,
): LinkActor {
  return request.creatorId
    ? new CreatorLinkActor(request.creatorId)
    : new AdminLinkActor(request.principal?.userId ?? null);
}

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

  /** The creator or an admin puts another link in place of one platform's link (AC 9). */
  @Put(':id/links/:platform')
  @UseGuards(CreatorOrAdminGuard)
  replace(
    @Param('id', new ParseUUIDPipe()) contentId: string,
    @Param('platform') platform: string,
    @Body() body: unknown,
    @Req() request: CreatorRequest & AdminRequest,
  ): Promise<ContentLinksResult> {
    return this.links.replace(
      contentId,
      actorOf(request),
      checkLinkReplacement(platform, body),
    );
  }
}
