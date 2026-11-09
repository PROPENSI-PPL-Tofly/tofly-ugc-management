import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';
import {
  IMAGE_MAX_BYTES,
  imageTooLarge,
  imageTypeRefused,
} from './revision-note-image-file.js';

/**
 * Multer reading one field, `file`, into memory and nothing else: it stops at the first byte
 * over 5 MB, a second file, or any text field, so no request makes the server hold more than
 * one screenshot. File names are read as UTF-8, as browsers send them.
 */
const MulterNoteImage = FileInterceptor('file', {
  // busboy counts its limits inclusively: a file of exactly fileSize bytes is already "too
  // large", so the limit is one byte over the rule, which the check applies exactly (AC 4).
  limits: { fileSize: IMAGE_MAX_BYTES + 1, files: 1, fields: 0 },
  defParamCharset: 'utf8',
});

/**
 * Reads the screenshot upload and words any way the form is wrong as the admin's 422, the
 * same answer the image check gives (AC 4), instead of Nest's raw 400 and 413.
 */
@Injectable()
export class NoteImageUploadInterceptor implements NestInterceptor {
  private readonly multer: NestInterceptor = new MulterNoteImage();

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    try {
      // Resolves once multer has read the request; the handler's own errors stay in the
      // Observable it returns and are not caught here.
      return await this.multer.intercept(context, next);
    } catch (error) {
      throw error instanceof PayloadTooLargeException
        ? imageTooLarge()
        : imageTypeRefused();
    }
  }
}
