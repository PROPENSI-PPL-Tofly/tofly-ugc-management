import { Prisma } from '@prisma/client';
import { MAX_CODE_ATTEMPTS } from './login-code-check.js';
import type { LoginCodeRow, LoginCodeStore } from './login-code-store.js';

interface StoredLoginCode {
  id: string;
  code_hash: string;
  expires_at: Date;
  attempts: number;
  used_at: Date | null;
}

/** The slice of PrismaService the store uses, so a test can hand it a fake. */
export interface LoginCodeStoreClient {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
  login_codes: {
    findFirst(args: {
      where: { email: string };
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }];
      select: {
        id: true;
        code_hash: true;
        expires_at: true;
        attempts: true;
        used_at: true;
      };
    }): Promise<StoredLoginCode | null>;
    updateMany(args: {
      where: { id: string; used_at: null; attempts: { lt: number } };
      data: { used_at: Date };
    }): Promise<{ count: number }>;
  };
}

/**
 * The login_codes table as code verification (PBI-39, 39.3) reads it. Every change is one
 * conditional statement, so two requests racing on the same code can neither share an attempt
 * count nor both sign in with it.
 */
export class PrismaLoginCodeStore implements LoginCodeStore {
  constructor(private readonly prisma: LoginCodeStoreClient) {}

  async latest(email: string): Promise<LoginCodeRow | null> {
    const row = await this.prisma.login_codes.findFirst({
      where: { email },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        code_hash: true,
        expires_at: true,
        attempts: true,
        used_at: true,
      },
    });
    if (row === null) return null;
    return {
      id: row.id,
      codeHash: row.code_hash,
      expiresAt: row.expires_at,
      attempts: row.attempts,
      usedAt: row.used_at,
    };
  }

  async recordWrongAttempt(id: string): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<{ attempts: number }[]>(
      Prisma.sql`UPDATE login_codes SET attempts = attempts + 1
        WHERE id = ${id}::uuid AND attempts < ${MAX_CODE_ATTEMPTS}
        RETURNING attempts`,
    );
    return rows[0]?.attempts ?? null;
  }

  async claim(id: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.login_codes.updateMany({
      where: { id, used_at: null, attempts: { lt: MAX_CODE_ATTEMPTS } },
      data: { used_at: at },
    });
    return count === 1;
  }
}
