import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { CreatorOrAdminGuard } from '../auth/creator-or-admin.guard.js';
import { unauthenticated } from '../auth/creator-request.js';
import type { CreatorRequest } from '../auth/creator-request.js';
import { sendOpenedFile } from '../storage/open-file-response.js';
import {
  checkRevisionNoteImage,
  type UploadedNoteImage,
} from './revision-note-image-file.js';
import { NoteImageUploadInterceptor } from './note-image-upload.interceptor.js';
import type { RevisionNoteImageDto } from './revision-note-images.service.js';
import { RevisionNoteImagesService } from './revision-note-images.service.js';

/**
 * The screenshots of a revision note (PBI-34, 34.1): an admin attaches, takes away and sends
 * the note (AC 3-5); opening is the one route both sides share — an admin any image, a creator
 * only their own content's — and answers with a short-lived signed link (AC 6).
 */
@Controller('submissions')
export class RevisionNoteImagesController {
  constructor(
    @Inject(RevisionNoteImagesService)
    private readonly images: Pick<
      RevisionNoteImagesService,
      'upload' | 'remove' | 'list'
    >,
  ) {}

  @Get(':id/revision-note-images')
  @UseGuards(AdminGuard)
  list(
    @Param('id', new ParseUUIDPipe()) submissionId: string,
    @Req() request: Pick<AdminRequest, 'principal'>,
  ): Promise<RevisionNoteImageDto[]> {
    if (request.principal?.role !== 'admin') throw unauthenticated();

    return this.images.list(submissionId);
  }

  @Post(':id/revision-note-images')
  @UseGuards(AdminGuard)
  @UseInterceptors(NoteImageUploadInterceptor)
  upload(
    @Param('id', new ParseUUIDPipe()) submissionId: string,
    @UploadedFile() file: UploadedNoteImage | undefined,
    @Req() request: Pick<AdminRequest, 'principal'>,
  ): Promise<RevisionNoteImageDto> {
    if (request.principal?.role !== 'admin') throw unauthenticated();

    return this.images.upload(
      submissionId,
      checkRevisionNoteImage(file),
      request.principal.userId,
    );
  }

  @Delete(':id/revision-note-images/:imageId')
  @UseGuards(AdminGuard)
  async remove(
    @Param('id', new ParseUUIDPipe()) submissionId: string,
    @Param('imageId', new ParseUUIDPipe()) imageId: string,
    @Req() request: Pick<AdminRequest, 'principal'>,
  ): Promise<void> {
    if (request.principal?.role !== 'admin') throw unauthenticated();

    await this.images.remove(submissionId, imageId);
  }
}

/**
 * Opening one screenshot by the URL every read path carries (PBI-34, AC 6): the payload and
 * the upload answer name this route, so it answers with the short-lived signed link whoever
 * may see the image — an admin any one, a creator only their own content's.
 */
@Controller('revision-note-images')
export class RevisionNoteImageController {
  constructor(
    @Inject(RevisionNoteImagesService)
    private readonly images: Pick<RevisionNoteImagesService, 'open'>,
  ) {}

  @Get(':imageId')
  @UseGuards(CreatorOrAdminGuard)
  async open(
    @Param('imageId', new ParseUUIDPipe()) imageId: string,
    @Req()
    request: Pick<CreatorRequest, 'creatorId'> & Pick<AdminRequest, 'principal'>,
    @Res() res: Response,
  ): Promise<void> {
    // A creator's request carries their creator id; an admin's carries only a principal, and
    // the service opens any image for them (AC 6).
    sendOpenedFile(
      res,
      await this.images.open(imageId, { creatorId: request.creatorId }),
    );
  }
}
