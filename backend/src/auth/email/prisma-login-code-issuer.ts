import { Prisma } from '@prisma/client';
import type {
  IssueRequest,
  IssueResult,
  LoginCodeIssuer,
} from './login-code-issuer.js';

/** The part of a Prisma transaction client issuing a code uses. */
interface IssueTransaction {
  $executeRaw(query: Prisma.Sql): Promise<number>;
  login_code_requests: {
    deleteMany(args: {
      where: { requested_at: { lte: Date } };
    }): Promise<unknown>;
    findMany(args: {
      where: { email: string; requested_at: { gt: Date } };
      orderBy: { requested_at: 'desc' };
      take: number;
      select: { requested_at: true };
    }): Promise<{ requested_at: Date }[]>;
    create(args: {
      data: { email: string; requested_at: Date };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  login_codes: {
    create(args: {
      data: {
        email: string;
        code_hash: string;
        created_at: Date;
        expires_at: Date;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
}

/** The part of the Prisma client the issuer uses. */
export interface LoginCodesClient {
  $transaction<T>(work: (tx: IssueTransaction) => Promise<T>): Promise<T>;
  login_codes: {
    deleteMany(args: { where: { id: string } }): Promise<unknown>;
  };
}

/** login_codes and login_code_requests in Postgres, through Prisma. */
export class PrismaLoginCodeIssuer implements LoginCodeIssuer {
  constructor(private readonly prisma: LoginCodesClient) {}

  issue(request: IssueRequest): Promise<IssueResult> {
    return this.prisma.$transaction(async (tx) => {
      // Under READ COMMITTED a transaction alone does not stop two requests from counting the
      // same four rows and both inserting a fifth. This lock, held until commit, queues the
      // email's requests; the count below runs after the previous holder committed, so it sees
      // that row. Unknown emails have no users row to lock FOR UPDATE, hence an advisory lock.
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`login_codes:${request.email}`}, 0))`,
      );
      // Requests older than the window never count again; any request clears them, so the log
      // holds about an hour of traffic without a scheduled job.
      await tx.login_code_requests.deleteMany({
        where: { requested_at: { lte: request.windowStart } },
      });
      // The limit counts requests, not codes: a code removed after a failed email keeps its slot.
      const recent = await tx.login_code_requests.findMany({
        where: {
          email: request.email,
          requested_at: { gt: request.windowStart },
        },
        orderBy: { requested_at: 'desc' },
        take: request.limit,
        select: { requested_at: true },
      });
      if (recent.length >= request.limit) {
        return {
          issued: false,
          oldestCreatedAt: recent[recent.length - 1].requested_at,
        };
      }
      // Verification reads the code with the latest created_at. The clock was read before this
      // request waited for the lock, so a request that read it earlier can get here later, and two
      // can read the same millisecond. Placing the code just after the email's newest request
      // makes created_at follow the order codes are really issued in; the expiry moves with it.
      const newest = recent[0]?.requested_at.getTime() ?? -Infinity;
      const shift = Math.max(0, newest + 1 - request.createdAt.getTime());
      const createdAt = new Date(request.createdAt.getTime() + shift);
      const row = await tx.login_codes.create({
        data: {
          email: request.email,
          code_hash: request.codeHash,
          created_at: createdAt,
          expires_at: new Date(request.expiresAt.getTime() + shift),
        },
        select: { id: true },
      });
      await tx.login_code_requests.create({
        data: { email: request.email, requested_at: createdAt },
        select: { id: true },
      });
      return { issued: true, id: row.id };
    });
  }

  async discard(id: string): Promise<void> {
    await this.prisma.login_codes.deleteMany({ where: { id } });
  }
}
