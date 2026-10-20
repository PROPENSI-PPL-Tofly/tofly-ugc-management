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
  PROOF_MAX_BYTES,
  proofInvalid,
  proofTooLarge,
} from './payment-proof-file.js';

/**
 * Multer reading one field, `file`, into memory and nothing else: it stops at the first byte
 * over 5 MB, a second file, or any text field, so no request makes the server hold more than one
 * proof. File names are read as UTF-8, as browsers send them.
 */
const MulterProof = FileInterceptor('file', {
  // busboy counts its limits inclusively: a file of exactly fileSize bytes is already "too large"
  // and one part refuses a lone file. So the file limit is one byte over the rule, which
  // checkPaymentProof applies exactly, and files with fields allow exactly one file part.
  limits: { fileSize: PROOF_MAX_BYTES + 1, files: 1, fields: 0 },
  defParamCharset: 'utf8',
});

/**
 * Reads the proof upload and words any way the form is wrong as the admin's 422, the same
 * answer the proof check gives, instead of Nest's raw 400 and 413.
 */
@Injectable()
export class ProofUploadInterceptor implements NestInterceptor {
  private readonly multer: NestInterceptor = new MulterProof();

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
        ? proofTooLarge()
        : proofInvalid();
    }
  }
}
