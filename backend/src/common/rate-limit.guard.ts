import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CLOCK, type Clock } from './clock.js';

/** Requests one client may make per window before the API starts refusing. */
export const RATE_LIMIT_MAX = 120;
export const RATE_LIMIT_WINDOW_MS = 60_000;

interface Window {
  count: number;
  resetAt: number;
}

/** The originating address: the first X-Forwarded-For entry, else the socket address. */
function clientAddress(request: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const forwarded = request.headers?.['x-forwarded-for'];
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = header?.split(',')[0]?.trim();

  return first || request.ip || 'unknown';
}

/**
 * A fixed-window limit per client address.
 *
 * Deliberately in-process: it exists to stop one caller from hammering the roster query,
 * not to enforce a quota across instances. A shared store would be the answer for that, and
 * for anything stronger the limit belongs in front of the service entirely.
 *
 * Clients are identified by X-Forwarded-For before the socket address, because in
 * production every browser request arrives through the frontend's proxy: keying on the
 * socket alone would put every admin in one bucket and let ordinary use lock the team out.
 * That header is caller-controllable, so this is a guard against accidental load, never an
 * access control — someone deliberately spoofing it simply gets their own bucket.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  /** Exposed for tests: expired windows must not accumulate for the life of the process. */
  get trackedClients(): number {
    return this.windows.size;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const client = clientAddress(request);
    const now = this.clock.now().getTime();

    this.evictExpired(now);

    const window = this.windows.get(client);
    if (!window) {
      this.windows.set(client, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return true;
    }

    if (window.count >= RATE_LIMIT_MAX) {
      throw new HttpException(
        {
          code: 'TOO_MANY_REQUESTS',
          message: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    window.count += 1;
    return true;
  }

  private evictExpired(now: number): void {
    for (const [client, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(client);
    }
  }
}
