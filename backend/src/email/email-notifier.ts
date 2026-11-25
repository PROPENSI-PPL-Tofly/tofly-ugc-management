import type { Logger } from '@nestjs/common';
import type { EmailLogStore, LoggedEmail } from './email-log-store.js';
import type { EmailSender } from './email-sender.js';
import type { EmailTemplates } from './email-templates.js';

// The sending helper of PBI-11 (11.1). A service calls it once its action is saved: the email is
// logged first, so an event sends one email per recipient even when it is retried (AC 8), then
// rendered and sent within 10 seconds. Whatever goes wrong is logged and kept on the row for the
// 08:00 run, never thrown: the action already succeeded (AC 9, OWASP A10:2025).

/** How long an action waits for the mail server before the email counts as failed. */
export const EMAIL_TIMEOUT_MS = 10_000;

/** The sender every PBI-11 email shows (AC 7). */
export const EMAIL_SENDER_NAME = 'Tofly';

export interface EmailRecipient {
  email: string;
  /** For the greeting by name (AC 7). */
  name: string;
}

export interface EmailEvent {
  /** Names the event, e.g. "content_scheduled:<content id>"; one email per key and recipient. */
  eventKey: string;
  template: string;
  to: EmailRecipient;
  /** What the template fills in; never tokens, Admin-only notes or an early-end reason (AC 10). */
  data: Record<string, unknown>;
}

/** The mail server took longer than EMAIL_TIMEOUT_MS. */
class EmailTimeout extends Error {}

/** Only the class of a failure is kept: a provider's message can quote the address (OWASP A09). */
export function errorKind(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

export class EmailNotifier {
  constructor(
    private readonly store: EmailLogStore,
    private readonly sender: EmailSender,
    private readonly templates: EmailTemplates,
    private readonly log: Pick<Logger, 'warn'>,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Sends the event's email to one recipient; resolves whatever happens. */
  async notify({ eventKey, template, to, data }: EmailEvent): Promise<void> {
    const email: LoggedEmail = {
      eventKey,
      template,
      recipient: to.email,
      payload: { ...data, recipientName: to.name },
    };
    let claimed: boolean;
    try {
      claimed = await this.store.claim(email);
    } catch (error) {
      this.warn(template, error);
      return;
    }
    if (claimed) await this.deliver(email);
  }

  /**
   * The 08:00 run's second or third attempt at a failed email (11.3, AC 9): the same template and
   * recipient, rendered again from the data its row kept. True when it was sent.
   */
  retry(email: LoggedEmail): Promise<boolean> {
    return this.deliver(email);
  }

  /** The same event to several recipients (every active Admin, AC 5): one email each. */
  async notifyAll(
    event: Omit<EmailEvent, 'to'> & { to: readonly EmailRecipient[] },
  ): Promise<void> {
    for (const to of event.to) {
      await this.notify({ ...event, to });
    }
  }

  /** Renders, sends within the timeout and marks the logged row; never throws. */
  private async deliver({ eventKey, template, recipient, payload }: LoggedEmail): Promise<boolean> {
    let sent = false;
    try {
      const rendered = this.templates.render(template, payload);
      await this.withinTimeout(
        this.sender.send({ to: recipient, senderName: EMAIL_SENDER_NAME, ...rendered }),
      );
      sent = true;
      await this.store.markSent(eventKey, recipient, this.clock());
    } catch (error) {
      const kind = this.warn(template, error);
      // A sent email is never marked failed, or the 08:00 run would send it twice.
      if (!sent) {
        await this.store
          .markFailed(eventKey, recipient, kind, this.clock())
          .catch(() => undefined);
      }
    }
    return sent;
  }

  /** The one warning a failed email leaves: its template and error kind, never the recipient. */
  private warn(template: string, error: unknown): string {
    const kind = errorKind(error);
    this.log.warn(`Email ${template} failed (${kind})`);
    return kind;
  }

  private async withinTimeout(sending: Promise<void>): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new EmailTimeout()), EMAIL_TIMEOUT_MS);
    });
    try {
      await Promise.race([sending, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
