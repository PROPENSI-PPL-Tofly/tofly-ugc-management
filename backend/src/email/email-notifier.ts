import type { Logger } from '@nestjs/common';
import { PortNotReady } from '../auth/google/unready-ports.js';
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

/** The mail server took longer than EMAIL_TIMEOUT_MS: it may still send it, so never retried. */
class EmailTimeout extends Error {}

/** The template took the whole EMAIL_TIMEOUT_MS: the mail server was never asked, so retried. */
class RenderTimeout extends Error {}

/** An SMTP error code such as ESOCKET, EAUTH or ETIMEDOUT: letters, digits and underscores only. */
const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,31}$/;

/**
 * What a failure is, never what it says: a provider's message can quote the address (OWASP A09).
 * nodemailer throws a plain Error, so its code tells one SMTP failure from another; anything that
 * does not look like a code falls back to the class name.
 */
export function errorKind(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && ERROR_CODE.test(code) ? code : error.constructor.name;
}

export class EmailNotifier {
  constructor(
    private readonly store: EmailLogStore,
    private readonly sender: EmailSender,
    private readonly templates: EmailTemplates,
    private readonly log: Pick<Logger, 'warn'>,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Sends the event's email to one recipient; true only once it went out and was logged sent. */
  async notify({ eventKey, template, to, data }: EmailEvent): Promise<boolean> {
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
      return false;
    }
    return claimed && this.deliver(email);
  }

  /**
   * The 08:00 run's second or third attempt at a failed email (11.3, AC 9): the same template and
   * recipient, rendered again from the data its row kept. True when it was sent.
   */
  async retry(email: LoggedEmail): Promise<boolean> {
    // Claimed first, like a first send, so two runs at once send it once (review on #253).
    let claimed: boolean;
    try {
      claimed = await this.store.claimRetry(email, this.clock());
    } catch (error) {
      this.warn(email.template, error);
      return false;
    }
    return claimed && this.deliver(email);
  }

  /**
   * The same event to several recipients (every active Admin, AC 5): one email each, all at
   * once, so a slow mail server holds the action 10 seconds, not 10 per recipient. notify never
   * rejects, so one recipient's failure never stops the others.
   */
  async notifyAll(
    event: Omit<EmailEvent, 'to'> & { to: readonly EmailRecipient[] },
  ): Promise<void> {
    await Promise.all(event.to.map((to) => this.notify({ ...event, to })));
  }

  /**
   * Renders, sends within the timeout and marks the logged row; never throws. True only when the
   * row says sent: a send it could not mark stays pending and is picked up again (review on #253).
   */
  private async deliver({ eventKey, template, recipient, payload }: LoggedEmail): Promise<boolean> {
    let sent = false;
    const clock = { expired: false, asked: false };
    try {
      // Rendering counts against the same 10 seconds: the Paid email reads its PDF first (11.4).
      const sending = (async () => {
        const rendered = await this.templates.render(template, payload);
        // Too late: the email is already marked failed, so it must not go out now (AC 8).
        if (clock.expired) return;
        // Review on #253 (Kak Satria, AC 8): from here the mail server may accept it, so a row
        // whose sent mark is lost stays sending and is closed by the 08:00 run, never sent again.
        await this.store.startSending(eventKey, recipient, this.clock());
        if (clock.expired) return;
        clock.asked = true;
        await this.sender.send({ to: recipient, senderName: EMAIL_SENDER_NAME, ...rendered });
      })();
      await this.withinTimeout(sending, clock);
      sent = true;
      await this.markSent(eventKey, recipient);
      return true;
    } catch (error) {
      const kind = this.warn(template, error);
      // A sent email is never marked failed, or the 08:00 run would send it twice.
      if (!sent) {
        // Templates or SMTP not set up yet: nothing was attempted, so no attempt is used up.
        const marking =
          error instanceof PortNotReady
            ? this.store.markNotReady(eventKey, recipient, this.clock())
            : this.store.markFailed(eventKey, recipient, kind, this.clock());
        await marking.catch(() => undefined);
      }
      return false;
    }
  }

  /** SMTP accepted it, so one more try at the mark keeps the log honest; a second failure throws. */
  private async markSent(eventKey: string, recipient: string): Promise<void> {
    try {
      await this.store.markSent(eventKey, recipient, this.clock());
    } catch {
      await this.store.markSent(eventKey, recipient, this.clock());
    }
  }

  /** The one warning a failed email leaves: its template and error kind, never the recipient. */
  private warn(template: string, error: unknown): string {
    const kind = errorKind(error);
    this.log.warn(`Email ${template} failed (${kind})`);
    return kind;
  }

  private async withinTimeout(
    sending: Promise<void>,
    clock: { expired: boolean; asked: boolean },
  ): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        clock.expired = true;
        reject(clock.asked ? new EmailTimeout() : new RenderTimeout());
      }, EMAIL_TIMEOUT_MS);
    });
    try {
      await Promise.race([sending, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
