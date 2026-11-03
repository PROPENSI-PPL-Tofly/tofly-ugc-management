import {
  BadRequestException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

// PostgreSQL text cannot hold the NUL character (U+0000), but JSON can carry it as \u0000. Left
// alone it passes every field check and fails inside the database, and the request ends in a 500
// (found by ZAP's API scan, docs/security/tofly-security-assessment.md). Refusing it here, once,
// answers every endpoint with a clear 400 before any handler or query runs (OWASP A10:2025).

const NUL = '\u0000';

/** Whether a parsed JSON value holds a NUL character in any string, key or nested value. */
function holdsNul(value: unknown): boolean {
  if (typeof value === 'string') return value.includes(NUL);
  if (Array.isArray(value)) return value.some(holdsNul);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).some(
      ([key, item]) => key.includes(NUL) || holdsNul(item),
    );
  }
  return false;
}

@Injectable()
export class RejectNulCharactersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const { body } = context.switchToHttp().getRequest<{ body?: unknown }>();
      if (holdsNul(body)) {
        throw new BadRequestException({
          code: 'INVALID_CHARACTERS',
          message: 'Teks berisi karakter yang tidak diizinkan',
        });
      }
    }
    return next.handle();
  }
}
