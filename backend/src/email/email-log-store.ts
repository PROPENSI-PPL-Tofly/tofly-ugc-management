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

export interface EmailLogStore {
  /** Logs the email as pending; false when the event already has this recipient. */
  claim(email: LoggedEmail): Promise<boolean>;
  markSent(eventKey: string, recipient: string, at: Date): Promise<void>;
  /** error is only the kind of failure: a provider's message can quote the address (OWASP A09). */
  markFailed(eventKey: string, recipient: string, error: string, at: Date): Promise<void>;
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
}
