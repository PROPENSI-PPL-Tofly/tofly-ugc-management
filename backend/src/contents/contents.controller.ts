import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ContentCreationService } from './contents.service.js';
import { checkNewContent } from './new-content.js';

export interface ContentCreator {
  create(input: unknown): Promise<unknown>;
}

@Controller('contents')
export class ContentsController {
  constructor(
    @Inject(ContentCreationService)
    private readonly contents: ContentCreator,
  ) {}

  @Post()
  async create(@Body() body: unknown): Promise<unknown> {
    checkNewContent(body);
    return this.contents.create(body);
  }
}