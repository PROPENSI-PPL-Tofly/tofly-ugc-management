import { Body, Controller, Post } from '@nestjs/common';
import { ContentsService, type CreatedContent } from './contents.service.js';

@Controller('contents')
export class ContentsController {
  constructor(private readonly contents: ContentsService) {}

  @Post()
  async create(@Body() body: unknown): Promise<CreatedContent> {
    return this.contents.create(body);
  }
}
