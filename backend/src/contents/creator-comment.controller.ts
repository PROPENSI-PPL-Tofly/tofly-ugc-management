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
import { checkCreatorComment } from './creator-comment.js';
import {
  CreatorCommentService,
  type CreatorCommentWriter,
} from './creator-comment.service.js';

@Controller('contents')
@UseGuards(DevCreatorGuard)
export class CreatorCommentController {
  constructor(
    @Inject(CreatorCommentService)
    private readonly comments: CreatorCommentWriter,
  ) {}

  @Post(':id/comments')
  async addComment(
    @Param('id', new ParseUUIDPipe()) contentId: string,
    @CurrentCreator() creatorId: string,
    @Body() body: unknown,
  ): Promise<void> {
    await this.comments.addComment(
      contentId,
      creatorId,
      checkCreatorComment(body),
    );
  }
}
