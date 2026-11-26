import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

// Where PBI-11 keeps every email it sends (11.1): the email_log row is written before the email
// goes out, so the unique (event_key, recipient) key decides whether it may go out at all (AC 8),
// and its status, attempts and template data are what the 08:00 run retries from (AC 9).

/** One email as it is logged before sending. */
export interface LoggedEmail {
  eventKey: string;
  template: string;
  recipient: string;
  /** The template data, kept for a retry; never tokens or Admin-only notes (AC 10). */
  payload: Record<string, unknown>;
}

/** AC 9: an email is tried at most this many times in total, its first send included. */
export const MAX_EMAIL_ATTEMPTS = 3;

export interface EmailLogStore {
  /** Logs the email as pending; false when the event already has this recipient. */
  claim(email: LoggedEmail): Promise<boolean>;
  markSent(eventKey: string, recipient: string, at: Date): Promise<void>;
  /** error is only the kind of failure: a provider's message can quote the address (OWASP A09). */
  markFailed(eventKey: string, recipient: string, error: string, at: Date): Promise<void>;
  /** Templates or SMTP not set up: failed for now, with no attempt used, so it is sent once they are. */
  markNotReady(eventKey: string, recipient: string, at: Date): Promise<void>;
  /** Marks the row sending just before the mail server is asked (review on #253, AC 8). */
  startSending(eventKey: string, recipient: string, at: Date): Promise<void>;
  /** The rows left sending for 30 minutes at `at`: they may have gone out, so they are closed. */
  stuckSending(at: Date): Promise<LoggedEmail[]>;
  /** The failed emails the 08:00 run may still try again at `at`, oldest first (11.3). */
  failedToRetry(at: Date): Promise<LoggedEmail[]>;
  /** Moves a retryable row to pending in one guarded update; false when another run got it. */
  claimRetry(email: LoggedEmail, at: Date): Promise<boolean>;
  /** Closes a row for good, every attempt used, with why it will not be sent. */
  abandon(eventKey: string, recipient: string, reason: string, at: Date): Promise<void>;
}

/**
 * A pending row untouched this long was cut off before the mail server was asked: retry it. A row
 * left sending this long may have gone out: close it (review on #253).
 */
export const STALE_PENDING_MS = 30 * 60 * 1000;

/**
 * What the 08:00 run may try again at `at` (review on #253): failed with attempts left, or pending
 * and untouched for 30 minutes (Gunta), but never a send that timed out, which may still have gone
 * out late (Davin). A null last_error is matched on its own: `not` alone would leave nulls out.
 */
function retryable(at: Date): Prisma.email_logWhereInput {
  return {
    attempts: { lt: MAX_EMAIL_ATTEMPTS },
    AND: [
      {
        OR: [
          { status: 'failed' },
          { status: 'pending', updated_at: { lt: new Date(at.getTime() - STALE_PENDING_MS) } },
        ],
      },
      { OR: [{ last_error: null }, { last_error: { not: 'EmailTimeout' } }] },
    ],
  };
}

/** The slice of Prisma the store touches, so tests hand in a stub of just that. */
export interface EmailLogClient {
  email_log: {
    createMany(args: {
      data: Prisma.email_logCreateManyInput[];
      skipDuplicates: true;
    }): Promise<{ count: number }>;
    update(args: {
      where: Prisma.email_logWhereUniqueInput;
      data: Prisma.email_logUpdateInput;
    }): Promise<unknown>;
    updateMany(args: {
      where: Prisma.email_logWhereInput;
      data: Prisma.email_logUpdateManyMutationInput;
    }): Promise<{ count: number }>;
    findMany(args: {
      where: Prisma.email_logWhereInput;
      orderBy: Prisma.email_logOrderByWithRelationInput[];
      select: { event_key: true; template: true; recipient: true; payload: true };
    }): Promise<
      { event_key: string; template: string; recipient: string; payload: Prisma.JsonValue }[]
    >;
  };
}

function byEventAndRecipient(eventKey: string, recipient: string) {
  return { event_key_recipient: { event_key: eventKey, recipient } };
}

/** Nest injection token for EmailLogStore, since an interface does not exist at runtime. */
export const EMAIL_LOG_STORE = Symbol('EMAIL_LOG_STORE');

@Injectable()
export class PrismaEmailLogStore implements EmailLogStore {
  constructor(@Inject(PrismaService) private readonly prisma: EmailLogClient) {}

  async claim({ eventKey, template, recipient, payload }: LoggedEmail): Promise<boolean> {
    // skipDuplicates is ON CONFLICT DO NOTHING: of two requests claiming at once, one inserts.
    const { count } = await this.prisma.email_log.createMany({
      data: [
        {
          event_key: eventKey,
          template,
          recipient,
          payload: payload as Prisma.InputJsonObject,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async markSent(eventKey: string, recipient: string, at: Date): Promise<void> {
    await this.prisma.email_log.update({
      where: byEventAndRecipient(eventKey, recipient),
      data: {
        status: 'sent',
        attempts: { increment: 1 },
        last_error: null,
        sent_at: at,
        updated_at: at,
      },
    });
  }

  async markFailed(eventKey: string, recipient: string, error: string, at: Date): Promise<void> {
    await this.prisma.email_log.update({
      where: byEventAndRecipient(eventKey, recipient),
      data: {
        status: 'failed',
        attempts: { increment: 1 },
        last_error: error,
        updated_at: at,
      },
    });
  }

  async markNotReady(eventKey: string, recipient: string, at: Date): Promise<void> {
    await this.prisma.email_log.update({
      where: byEventAndRecipient(eventKey, recipient),
      data: { status: 'failed', last_error: 'PortNotReady', updated_at: at },
    });
  }

  async startSending(eventKey: string, recipient: string, at: Date): Promise<void> {
    // No attempt yet: markSent or markFailed counts it once the mail server has answered.
    await this.prisma.email_log.update({
      where: byEventAndRecipient(eventKey, recipient),
      data: { status: 'sending', updated_at: at },
    });
  }

  failedToRetry(at: Date): Promise<LoggedEmail[]> {
    return this.read(retryable(at));
  }

  stuckSending(at: Date): Promise<LoggedEmail[]> {
    return this.read({
      status: 'sending',
      updated_at: { lt: new Date(at.getTime() - STALE_PENDING_MS) },
    });
  }

  private async read(where: Prisma.email_logWhereInput): Promise<LoggedEmail[]> {
    const rows = await this.prisma.email_log.findMany({
      where,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: { event_key: true, template: true, recipient: true, payload: true },
    });
    return rows.map((row) => ({
      eventKey: row.event_key,
      template: row.template,
      recipient: row.recipient,
      // Written by claim() as an object, never anything else.
      payload: row.payload as Record<string, unknown>,
    }));
  }

  async claimRetry({ eventKey, recipient }: LoggedEmail, at: Date): Promise<boolean> {
    // The guard is in the UPDATE itself: of two runs at once, one row lock decides the winner.
    const { count } = await this.prisma.email_log.updateMany({
      where: { event_key: eventKey, recipient, ...retryable(at) },
      data: { status: 'pending', updated_at: at },
    });
    return count === 1;
  }

  async abandon(eventKey: string, recipient: string, reason: string, at: Date): Promise<void> {
    await this.prisma.email_log.update({
      where: byEventAndRecipient(eventKey, recipient),
      data: { status: 'failed', attempts: MAX_EMAIL_ATTEMPTS, last_error: reason, updated_at: at },
    });
  }
}
