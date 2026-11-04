import type { PrismaService } from '../../prisma/prisma.service.js';
import type {
  IssueResult,
  LoginCodeIssuer,
  NewLoginCode,
} from './login-code-issuer.js';
import { CODES_PER_HOUR, RATE_WINDOW_MS } from './login-code-request.js';

/** The database operations this adapter uses. */
export type LoginCodeIssuerClient = Pick<PrismaService, '$transaction'>;

/** Keeps these advisory locks apart from any other the database may take on a text key. */
const LOCK_PREFIX = 'login_codes:';

/** login_codes behind the LoginCodeIssuer port. */
export class PrismaLoginCodeIssuer implements LoginCodeIssuer {
  constructor(private readonly prisma: LoginCodeIssuerClient) {}

  issue(code: NewLoginCode, now: Date): Promise<IssueResult> {
    return this.prisma.$transaction(async (tx): Promise<IssueResult> => {
      // Requests for one email queue here until the transaction ends. Without it, two parallel
      // requests could both count four codes and both store a fifth. Other emails never wait.
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${LOCK_PREFIX + code.email}, 0))`;
      const inWindow = await tx.login_codes.findMany({
        where: {
          email: code.email,
          createdAt: { gt: new Date(now.getTime() - RATE_WINDOW_MS) },
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
        take: CODES_PER_HOUR,
      });
      if (inWindow.length >= CODES_PER_HOUR) {
        return { issued: false, oldestInWindow: inWindow[0].createdAt };
      }
      await tx.login_codes.updateMany({
        where: { email: code.email, usedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      });
      await tx.login_codes.create({ data: { ...code, createdAt: now } });
      return { issued: true };
    });
  }
}
