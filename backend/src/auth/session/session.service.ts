import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import type { Principal } from '../google/ports.js';
import { sessionCookie, type SessionCookie } from './session-cookie.js';
import type { SessionConfig } from './session-config.js';

const SESSION_ID = /^[A-Za-z0-9_-]{43}$/;

interface StoredSession {
  idHash: string;
  userId: string;
  role: string;
  creatorId: string | null;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

/** The small Prisma surface required by the session lifecycle. */
export interface SessionRepository {
  create(args: { data: StoredSession }): Promise<unknown>;
  findUnique(args: { where: { idHash: string } }): Promise<unknown>;
  update(args: {
    where: { idHash: string };
    data: { idleExpiresAt: Date };
  }): Promise<unknown>;
  deleteMany(args: { where: { idHash: string } }): Promise<unknown>;
}

function sessionIdHash(id: string): string {
  return createHash('sha256').update(id).digest('hex');
}

function validId(id: unknown): id is string {
  if (typeof id !== 'string' || !SESSION_ID.test(id)) return false;
  return Buffer.from(id, 'base64url').toString('base64url') === id;
}

function storedSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<StoredSession>;
  return (
    typeof row.idHash === 'string' &&
    typeof row.userId === 'string' &&
    (row.role === 'admin' || row.role === 'creator') &&
    (row.role === 'admin'
      ? row.creatorId === null
      : typeof row.creatorId === 'string') &&
    row.idleExpiresAt instanceof Date &&
    row.absoluteExpiresAt instanceof Date
  );
}

function principalOf(row: StoredSession): Principal {
  return row.role === 'admin'
    ? { userId: row.userId, role: 'admin' }
    : { userId: row.userId, role: 'creator', creatorId: row.creatorId! };
}

export class AppSessionService {
  private readonly now: () => Date;
  private readonly cookie: SessionCookie;

  constructor(
    private readonly sessions: SessionRepository,
    private readonly config: SessionConfig,
    cookie = sessionCookie(process.env),
  ) {
    this.now = config.now ?? (() => new Date());
    this.cookie = cookie;
  }

  /** A new random identifier is created after identity and access have been resolved. */
  async start(response: Response, principal: Principal): Promise<{ id: string }> {
    const id = randomBytes(32).toString('base64url');
    const now = this.now();
    const idleExpiresAt = new Date(now.getTime() + this.config.idleTimeoutMs);
    const absoluteExpiresAt = new Date(
      now.getTime() + this.config.absoluteLifetimeMs,
    );
    await this.sessions.create({
      data: {
        idHash: sessionIdHash(id),
        userId: principal.userId,
        role: principal.role,
        creatorId: principal.role === 'creator' ? principal.creatorId : null,
        idleExpiresAt,
        absoluteExpiresAt,
      },
    });
    response.cookie(this.cookie.name, id, {
      ...this.cookie.options,
      maxAge: idleExpiresAt.getTime() - now.getTime(),
    });
    return { id };
  }

  /** Resolves only a well-formed bearer ID backed by a live server-side row. */
  async authenticate(
    id: unknown,
    response?: Response,
  ): Promise<Principal | null> {
    if (!validId(id)) return null;

    const idHash = sessionIdHash(id);
    const value = await this.sessions.findUnique({ where: { idHash } });
    if (!storedSession(value)) return null;

    const now = this.now();
    if (
      value.idleExpiresAt.getTime() <= now.getTime() ||
      value.absoluteExpiresAt.getTime() <= now.getTime()
    ) {
      await this.sessions.deleteMany({ where: { idHash } });
      return null;
    }

    const idleExpiresAt = new Date(
      Math.min(
        now.getTime() + this.config.idleTimeoutMs,
        value.absoluteExpiresAt.getTime(),
      ),
    );
    await this.sessions.update({
      where: { idHash },
      data: { idleExpiresAt },
    });
    if (response) {
      response.cookie(this.cookie.name, id, {
        ...this.cookie.options,
        maxAge: idleExpiresAt.getTime() - now.getTime(),
      });
    }
    return principalOf(value);
  }

  /** Revokes the server record before removing the browser's copy. */
  async logout(id: unknown, response: Response): Promise<void> {
    if (validId(id)) {
      await this.sessions.deleteMany({ where: { idHash: sessionIdHash(id) } });
    }
    response.clearCookie(this.cookie.name, this.cookie.options);
  }

  cookieName(): string {
    return this.cookie.name;
  }
}
