import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { checkContentEdit } from './content-edit.js';
import {
  ContentEditService,
  type ContentEditor,
  type EditedContent,
} from './content-edit.service.js';

/**
 * Editing and deleting a scheduled content, for admins only (PBI-25, 25.1). The body is checked
 * here; whether the content may still change is the service's to decide, in its transaction.
 */
@Controller('contents')
@UseGuards(AdminGuard)
export class ContentEditController {
  constructor(
    @Inject(ContentEditService)
    private readonly contents: ContentEditor,
  ) {}

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
  ): Promise<EditedContent> {
    const edit = checkContentEdit(body);
    // The local development stand-in for sign-in lets an admin in with no account.
    return this.contents.update(id, edit, request.principal?.userId ?? null);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.contents.remove(id);
  }
}
