import {
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

/** The configured secret, from PERFORMANCE_SYNC_SECRET (Secret Manager on Cloud Run). */
export const SYNC_SECRET = Symbol('SYNC_SECRET');
/** The header the Cloud Scheduler job sends; Node gives header names in lower case. */
export const SYNC_SECRET_HEADER = 'x-sync-secret';
/** Shorter than this and the secret could be guessed, so it is treated as unset. */
export const MIN_SYNC_SECRET_LENGTH = 32;

interface HeaderRequest {
  headers: Record<string, unknown>;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function unauthorized(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'SYNC_SECRET_INVALID',
    message: 'Unauthorized',
  });
}

/**
 * Lets only the Cloud Scheduler job start the daily sync (PBI-27, 27.4). The secret is compared
 * as two SHA-256 digests with timingSafeEqual, so neither its length nor its characters leak
 * through timing, and with no usable secret configured every request is refused (OWASP A07).
 */
@Injectable()
export class SyncSecretGuard implements CanActivate {
  private readonly expected: Buffer | null;

  constructor(@Optional() @Inject(SYNC_SECRET) secret?: string) {
    const configured = secret?.trim();
    this.expected =
      configured !== undefined && configured.length >= MIN_SYNC_SECRET_LENGTH
        ? digest(configured)
        : null;
  }

  canActivate(context: ExecutionContext): boolean {
    const given = context.switchToHttp().getRequest<HeaderRequest>().headers[
      SYNC_SECRET_HEADER
    ];
    if (
      this.expected === null ||
      typeof given !== 'string' ||
      !timingSafeEqual(digest(given), this.expected)
    ) {
      throw unauthorized();
    }
    return true;
  }
}
