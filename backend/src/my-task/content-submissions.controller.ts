import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentCreator } from '../auth/current-creator.decorator.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import type { MyTask } from './dto/my-task.dto.js';
import { SubmitDraftDto } from './dto/submit-draft.dto.js';
import { MyTaskService } from './my-task.service.js';

// What a creator hands in for one piece of content. Each route answers with the content's
// updated task row, so the list can reflect the new status without guessing it.
/* v8 ignore start */
@Controller('contents')
// TODO(PBI-9): replace with real Google OAuth session once auth lands.
@UseGuards(DevCreatorGuard)
/* v8 ignore stop */
export class ContentSubmissionsController {
  constructor(private readonly tasks: MyTaskService) {}

  @Post(':id/draft')
  submitDraft(
    @CurrentCreator() creatorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SubmitDraftDto,
  ): Promise<MyTask> {
    return this.tasks.submitDraft(creatorId, id, body);
  }
}
