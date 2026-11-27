import { Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { Principal, SessionStarter } from '../google/ports.js';

/** The part of AppSessionService a sign-in needs. */
export interface SessionStart {
  start(response: Response, principal: Principal): Promise<unknown>;
}

/** Where the time of a sign-in is kept: the users table. */
export interface SignInStamp {
  update(args: {
    where: { id: string };
    data: { last_signed_in_at: Date };
    select: { id: true };
  }): Promise<unknown>;
}

/**
 * The SESSION_STARTER both sign-in paths share (Google and email code), so "Login Terakhir" on
 * Pengguna Admin (PBI-23) is recorded in one place. A decorator around the session start: the
 * session service stays about sessions, and this adds one step after it (SOLID: Open/Closed).
 */
export class RecordingSessionStarter implements SessionStarter {
  private readonly log = new Logger(RecordingSessionStarter.name);

  constructor(
    private readonly sessions: SessionStart,
    private readonly users: SignInStamp,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async start(response: Response, principal: Principal): Promise<void> {
    await this.sessions.start(response, principal);
    try {
      await this.users.update({
        where: { id: principal.userId },
        data: { last_signed_in_at: this.now() },
        select: { id: true },
      });
    } catch (error) {
      // The person is signed in either way; only the class reaches the log (OWASP A09).
      const reason = error instanceof Error ? error.name : 'unknown error';
      this.log.warn(`Sign-in time was not recorded (${reason})`);
    }
  }
}
