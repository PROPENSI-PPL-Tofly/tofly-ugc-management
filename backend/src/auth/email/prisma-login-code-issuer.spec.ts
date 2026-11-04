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

/**
 * A fake Prisma client: one transaction at a time, recording every step in order. `recent` is
 * what the request log answers for the email's last hour, newest first.
 */
function fakePrisma(recent: { requested_at: Date }[]) {
  const steps: string[] = [];
  const tx = {
    $executeRaw: vi.fn((query: Prisma.Sql) => {
      steps.push('lock');
      return Promise.resolve(query.values.length);
    }),
    login_code_requests: {
      deleteMany: vi.fn((_args: unknown) => {
        steps.push('forget old requests');
        return Promise.resolve({ count: 0 });
      }),
      findMany: vi.fn((_args: unknown) => {
        steps.push('count requests');
        return Promise.resolve(recent);
      }),
      create: vi.fn((_args: unknown) => {
        steps.push('record request');
        return Promise.resolve({ id: 'request-row' });
      }),
    },
    login_codes: {
      create: vi.fn((_args: unknown) => {
        steps.push('insert code');
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
    it('locks the email, then counts, stores the code and records the request in one transaction', async () => {
      const { prisma, steps } = fakePrisma([]);
      await new PrismaLoginCodeIssuer(prisma).issue(REQUEST);
      expect(steps).toEqual([
        'begin',
        'lock',
        'forget old requests',
        'count requests',
        'insert code',
        'record request',
        'commit',
      ]);
    });

    it('takes a transaction-scoped advisory lock keyed by the email, as a bound value', async () => {
      const { prisma, tx } = fakePrisma([]);
      await new PrismaLoginCodeIssuer(prisma).issue(REQUEST);
      const [query] = tx.$executeRaw.mock.calls[0];
      expect(query.sql).toContain('pg_advisory_xact_lock(hashtextextended(');
      expect(query.sql).not.toContain(EMAIL);
      expect(query.values).toEqual([`login_codes:${EMAIL}`]);
    });

    it('forgets every request older than the window, whatever its email, so the log stays about an hour long', async () => {
      const { prisma, tx } = fakePrisma([]);
      await new PrismaLoginCodeIssuer(prisma).issue(REQUEST);
      expect(tx.login_code_requests.deleteMany).toHaveBeenCalledExactlyOnceWith(
        { where: { requested_at: { lte: REQUEST.windowStart } } },
      );
    });

    it('counts the email’s requests inside the window, not its codes, newest first, no more than the limit', async () => {
      const { prisma, tx } = fakePrisma([]);
      await new PrismaLoginCodeIssuer(prisma).issue(REQUEST);
      expect(tx.login_code_requests.findMany).toHaveBeenCalledWith({
        where: { email: EMAIL, requested_at: { gt: REQUEST.windowStart } },
        orderBy: { requested_at: 'desc' },
        take: 5,
        select: { requested_at: true },
      });
    });

    it('stores the code and records the request while the window has room, answering the code’s id', async () => {
      const { prisma, tx } = fakePrisma([
        { requested_at: new Date('2026-11-04T02:30:00.000Z') },
      ]);
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
      expect(tx.login_code_requests.create).toHaveBeenCalledWith({
        data: { email: EMAIL, requested_at: NOW },
        select: { id: true },
      });
    });

    it('refuses with the oldest counted request once the window is full, storing and recording nothing', async () => {
      const oldest = new Date('2026-11-04T02:10:00.000Z');
      const { prisma, tx } = fakePrisma([
        { requested_at: new Date('2026-11-04T02:50:00.000Z') },
        { requested_at: new Date('2026-11-04T02:40:00.000Z') },
        { requested_at: new Date('2026-11-04T02:30:00.000Z') },
        { requested_at: new Date('2026-11-04T02:20:00.000Z') },
        { requested_at: oldest },
      ]);
      await expect(
        new PrismaLoginCodeIssuer(prisma).issue(REQUEST),
      ).resolves.toEqual({ issued: false, oldestCreatedAt: oldest });
      expect(tx.login_codes.create).not.toHaveBeenCalled();
      expect(tx.login_code_requests.create).not.toHaveBeenCalled();
    });
  });

  describe('discard', () => {
    it('deletes the one code row by its id and leaves the request counted', async () => {
      const { prisma, tx } = fakePrisma([]);
      await new PrismaLoginCodeIssuer(prisma).discard('row-1');
      expect(prisma.login_codes.deleteMany).toHaveBeenCalledExactlyOnceWith({
        where: { id: 'row-1' },
      });
      expect(tx.login_code_requests.deleteMany).not.toHaveBeenCalled();
    });
  });
});
