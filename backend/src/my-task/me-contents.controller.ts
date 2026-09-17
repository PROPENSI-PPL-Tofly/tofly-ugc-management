import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentCreator } from '../auth/current-creator.decorator.js';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import type { MyTaskListResponse } from './dto/my-task.dto.js';
import { ListMyContentsQuery } from './dto/list-my-contents.query.js';
import { MyTaskService } from './my-task.service.js';

// "me" is whoever the auth guard says is signed in; the id never comes from the URL, so one
// creator cannot list another's work by changing a path segment.
/* v8 ignore start */
@Controller('me')
// TODO(PBI-9): replace with real Google OAuth session once auth lands.
@UseGuards(DevCreatorGuard)
/* v8 ignore stop */
export class MeContentsController {
  constructor(private readonly tasks: MyTaskService) {}

  @Get('contents')
  list(
    @CurrentCreator() creatorId: string,
    @Query() query: ListMyContentsQuery,
  ): Promise<MyTaskListResponse> {
    return this.tasks.list(creatorId, query);
  }
}
