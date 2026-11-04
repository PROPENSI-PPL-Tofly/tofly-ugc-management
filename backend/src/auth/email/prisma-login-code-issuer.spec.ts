import type { Prisma } from '@prisma/client';
import type { IssueRequest } from './login-code-issuer.js';
import { PrismaLoginCodeIssuer } from './prisma-login-code-issuer.js';

const EMAIL = 'rangga@example.com';
const NOW = new Date('2026-11-04T03:00:00.000Z');
const REQUEST: IssueRequest = {
  email: EMAIL,
  codeHash: 'a'.repeat(64),
  createdAt: NOW,
  expiresAt: new Date('2026-11-04T03:10:00.000Z'),
  windowStart: new Date('2026-11-04T02:00:00.000Z'),
  limit: 5,
};

/** A fake Prisma client: one transaction at a time, recording every step in order. */
function fakePrisma(recent: { created_at: Date }[]) {
  const steps: string[] = [];
  const tx = {
    $executeRaw: vi.fn((query: Prisma.Sql) => {
      steps.push('lock');
      return Promise.resolve(query.values.length);
    }),
    login_codes: {
      findMany: vi.fn((_args: unknown) => {
        steps.push('count');
        return Promise.resolve(recent);
      }),
      create: vi.fn((_args: unknown) => {
        steps.push('insert');
        return Promise.resolve({ id: 'new-row' });
      }),
    },
  };
  const prisma = {
    $transaction<T>(work: (client: typeof tx) => Promise<T>): Promise<T> {
      steps.push('begin');
      return work(tx).finally(() => steps.push('commit'));
    },
    login_codes: {
      deleteMany: vi.fn((_args: unknown) => Promise.resolve({ count: 1 })),
    },
  };
  return { prisma, tx, steps };
}

describe('PrismaLoginCodeIssuer', () => {
  describe('issue', () => {
    it('locks the email, counts and inserts inside one transaction, in that order', async () => {
      const { prisma, steps } = fakePrisma([]);
      await new PrismaLoginCodeIssuer(prisma).issue(REQUEST);
      expect(steps).toEqual(['begin', 'lock', 'count', 'insert', 'commit']);
    });

    it('takes a transaction-scoped advisory lock keyed by the email, as a bound value', async () => {
      const { prisma, tx } = fakePrisma([]);
      await new PrismaLoginCodeIssuer(prisma).issue(REQUEST);
      const [query] = tx.$executeRaw.mock.calls[0];
      expect(query.sql).toContain('pg_advisory_xact_lock(hashtextextended(');
      expect(query.sql).not.toContain(EMAIL);
      expect(query.values).toEqual([`login_codes:${EMAIL}`]);
    });

    it('reads only the rows of the email inside the window, newest first, no more than the limit', async () => {
      const { prisma, tx } = fakePrisma([]);
      await new PrismaLoginCodeIssuer(prisma).issue(REQUEST);
      expect(tx.login_codes.findMany).toHaveBeenCalledWith({
        where: { email: EMAIL, created_at: { gt: REQUEST.windowStart } },
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { created_at: true },
      });
    });

    it('stores the row while the window has room and answers its id', async () => {
      const { prisma, tx } = fakePrisma([{ created_at: NOW }]);
      await expect(
        new PrismaLoginCodeIssuer(prisma).issue(REQUEST),
      ).resolves.toEqual({ issued: true, id: 'new-row' });
      expect(tx.login_codes.create).toHaveBeenCalledWith({
        data: {
          email: EMAIL,
          code_hash: REQUEST.codeHash,
          created_at: NOW,
          expires_at: REQUEST.expiresAt,
        },
        select: { id: true },
      });
    });

    it('refuses with the oldest counted row once the window is full, storing nothing', async () => {
      const oldest = new Date('2026-11-04T02:10:00.000Z');
      const { prisma, tx } = fakePrisma([
        { created_at: new Date('2026-11-04T02:50:00.000Z') },
        { created_at: new Date('2026-11-04T02:40:00.000Z') },
        { created_at: new Date('2026-11-04T02:30:00.000Z') },
        { created_at: new Date('2026-11-04T02:20:00.000Z') },
        { created_at: oldest },
      ]);
      await expect(
        new PrismaLoginCodeIssuer(prisma).issue(REQUEST),
      ).resolves.toEqual({ issued: false, oldestCreatedAt: oldest });
      expect(tx.login_codes.create).not.toHaveBeenCalled();
    });
  });

  describe('discard', () => {
    it('deletes the one row by its id, never by email or by recency', async () => {
      const { prisma } = fakePrisma([]);
      await new PrismaLoginCodeIssuer(prisma).discard('row-1');
      expect(prisma.login_codes.deleteMany).toHaveBeenCalledExactlyOnceWith({
        where: { id: 'row-1' },
      });
    });
  });
});
