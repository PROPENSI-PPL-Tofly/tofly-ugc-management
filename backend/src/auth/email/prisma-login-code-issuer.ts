import { Prisma } from '@prisma/client';
import type {
  IssueRequest,
  IssueResult,
  LoginCodeIssuer,
} from './login-code-issuer.js';

/** The part of a Prisma transaction client issuing a code uses. */
interface IssueTransaction {
  $executeRaw(query: Prisma.Sql): Promise<number>;
  login_codes: {
    findMany(args: {
      where: { email: string; created_at: { gt: Date } };
      orderBy: { created_at: 'desc' };
      take: number;
      select: { created_at: true };
    }): Promise<{ created_at: Date }[]>;
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

/** login_codes in Postgres, through Prisma. */
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
      const recent = await tx.login_codes.findMany({
        where: {
          email: request.email,
          created_at: { gt: request.windowStart },
        },
        orderBy: { created_at: 'desc' },
        take: request.limit,
        select: { created_at: true },
      });
      if (recent.length >= request.limit) {
        return {
          issued: false,
          oldestCreatedAt: recent[recent.length - 1].created_at,
        };
      }
      const row = await tx.login_codes.create({
        data: {
          email: request.email,
          code_hash: request.codeHash,
          created_at: request.createdAt,
          expires_at: request.expiresAt,
        },
        select: { id: true },
      });
      return { issued: true, id: row.id };
    });
  }

  async discard(id: string): Promise<void> {
    await this.prisma.login_codes.deleteMany({ where: { id } });
  }
}
