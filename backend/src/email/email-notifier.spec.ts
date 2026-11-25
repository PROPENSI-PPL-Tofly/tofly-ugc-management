import { PortNotReady } from '../auth/google/unready-ports.js';
import type { EmailMessage, EmailSender } from './email-sender.js';
import type { EmailLogStore, LoggedEmail } from './email-log-store.js';
import type { EmailTemplates } from './email-templates.js';
import { EMAIL_TIMEOUT_MS, EmailNotifier, type EmailEvent } from './email-notifier.js';

const NOW = new Date('2026-11-25T01:00:00.000Z');

const EVENT: EmailEvent = {
  eventKey: 'content_scheduled:content-1',
  template: 'content_scheduled',
  to: { email: 'salsa@example.com', name: 'Salsa Amelia' },
  data: { contentName: 'Evg_1_Salsa_2026-12-01', deadline: '2026-12-01' },
};

function setup(overrides: { claim?: boolean; send?: EmailSender['send'] } = {}) {
  const store = {
    claim: vi.fn<EmailLogStore['claim']>().mockResolvedValue(overrides.claim ?? true),
    markSent: vi.fn<EmailLogStore['markSent']>().mockResolvedValue(),
    markFailed: vi.fn<EmailLogStore['markFailed']>().mockResolvedValue(),
    markNotReady: vi.fn<EmailLogStore['markNotReady']>().mockResolvedValue(),
    failedToRetry: vi.fn<EmailLogStore['failedToRetry']>().mockResolvedValue([]),
  };
  const sender = {
    send: vi.fn<EmailSender['send']>(overrides.send ?? (() => Promise.resolve())),
  };
  const templates = {
    render: vi.fn<EmailTemplates['render']>().mockReturnValue({
      subject: 'Konten baru untukmu',
      text: 'Halo Salsa Amelia',
      html: '<p>Halo Salsa Amelia</p>',
    }),
  };
  const log = { warn: vi.fn() };
  const notifier = new EmailNotifier(store, sender, templates, log, () => NOW);
  return { store, sender, templates, log, notifier };
}

describe('EmailNotifier', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('logs the email first, then sends the rendered template from "Tofly" (AC 7)', async () => {
    const { store, sender, templates, notifier } = setup();

    await notifier.notify(EVENT);

    const logged: LoggedEmail = {
      eventKey: EVENT.eventKey,
      template: EVENT.template,
      recipient: 'salsa@example.com',
      payload: { ...EVENT.data, recipientName: 'Salsa Amelia' },
    };
    expect(store.claim).toHaveBeenCalledWith(logged);
    expect(templates.render).toHaveBeenCalledWith('content_scheduled', logged.payload);
    expect(sender.send).toHaveBeenCalledWith<[EmailMessage]>({
      to: 'salsa@example.com',
      senderName: 'Tofly',
      subject: 'Konten baru untukmu',
      text: 'Halo Salsa Amelia',
      html: '<p>Halo Salsa Amelia</p>',
    });
    expect(store.claim.mock.invocationCallOrder[0]).toBeLessThan(
      sender.send.mock.invocationCallOrder[0],
    );
  });

  it('marks a sent email sent, at the moment it was accepted', async () => {
    const { store, notifier } = setup();

    await notifier.notify(EVENT);

    expect(store.markSent).toHaveBeenCalledWith(EVENT.eventKey, 'salsa@example.com', NOW);
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  // AC 8: the event was already logged for this recipient, so a retried action sends nothing.
  it('sends nothing for an event this recipient already has', async () => {
    const { store, sender, templates, notifier } = setup({ claim: false });

    await notifier.notify(EVENT);

    expect(templates.render).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
    expect(store.markSent).not.toHaveBeenCalled();
  });

  // AC 9: the action already saved, so a refused send is logged, never thrown at it.
  it('marks a refused send failed with only the error kind, and never throws', async () => {
    const refusal = Object.assign(new Error('535 bad login for salsa@example.com'), {
      name: 'SmtpError',
    });
    class SmtpError extends Error {}
    const { store, log, notifier } = setup({
      send: () => Promise.reject(Object.setPrototypeOf(refusal, SmtpError.prototype)),
    });

    await expect(notifier.notify(EVENT)).resolves.toBeUndefined();

    expect(store.markFailed).toHaveBeenCalledWith(EVENT.eventKey, 'salsa@example.com', 'SmtpError', NOW);
    expect(store.markSent).not.toHaveBeenCalled();
    // OWASP A09: the log names the template, never the recipient or the provider's words.
    expect(log.warn).toHaveBeenCalledWith('Email content_scheduled failed (SmtpError)');
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('salsa');
  });

  it('names a refusal that is not an Error by its type', async () => {
    const { store, notifier } = setup({ send: () => Promise.reject('down') });

    await notifier.notify(EVENT);

    expect(store.markFailed).toHaveBeenCalledWith(EVENT.eventKey, 'salsa@example.com', 'string', NOW);
  });

  // 11.1: a mail server that never answers holds the action for 10 seconds at most.
  it('gives up after 10 seconds and marks the email failed', async () => {
    vi.useFakeTimers();
    const { store, notifier } = setup({ send: () => new Promise(() => {}) });

    const done = notifier.notify(EVENT);
    await vi.advanceTimersByTimeAsync(EMAIL_TIMEOUT_MS - 1);
    expect(store.markFailed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;

    expect(EMAIL_TIMEOUT_MS).toBe(10_000);
    expect(store.markFailed).toHaveBeenCalledWith(EVENT.eventKey, 'salsa@example.com', 'EmailTimeout', NOW);
  });

  it('clears its timer once the send is accepted', async () => {
    vi.useFakeTimers();
    const { notifier } = setup();

    await notifier.notify(EVENT);

    expect(vi.getTimerCount()).toBe(0);
  });

  // AC 9: even the log itself failing never reaches the action.
  it.each([
    ['logging the email', 'claim'],
    ['marking it sent', 'markSent'],
  ] as const)('never throws when %s fails', async (_, step) => {
    const { store, log, notifier } = setup();
    store[step].mockRejectedValue(new TypeError('connection lost'));

    await expect(notifier.notify(EVENT)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith('Email content_scheduled failed (TypeError)');
  });

  it('never throws when a template cannot be rendered, and marks the email failed', async () => {
    const { store, templates, sender, notifier } = setup();
    templates.render.mockImplementation(() => {
      throw new RangeError('unknown template');
    });

    await expect(notifier.notify(EVENT)).resolves.toBeUndefined();
    expect(sender.send).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledWith(EVENT.eventKey, 'salsa@example.com', 'RangeError', NOW);
  });

  it('sends one email per recipient for an event with several', async () => {
    const { sender, notifier } = setup();

    await notifier.notifyAll({
      ...EVENT,
      to: [
        { email: 'rina@example.com', name: 'Rina' },
        { email: 'budi@example.com', name: 'Budi' },
      ],
    });

    expect(sender.send.mock.calls.map(([message]) => message.to)).toEqual([
      'rina@example.com',
      'budi@example.com',
    ]);
  });

  it('never throws when marking a failed email fails as well', async () => {
    const { store, notifier } = setup({ send: () => Promise.reject(new Error('down')) });
    store.markFailed.mockRejectedValue(new Error('connection lost'));

    await expect(notifier.notify(EVENT)).resolves.toBeUndefined();
  });

  it('stamps a sent email with the current time when no clock is given', async () => {
    const { store, sender, templates, log } = setup();
    vi.useFakeTimers({ now: NOW });

    await new EmailNotifier(store, sender, templates, log).notify(EVENT);

    expect(store.markSent).toHaveBeenCalledWith(EVENT.eventKey, 'salsa@example.com', NOW);
  });
});

// PBI-11 (11.3, AC 9): the 08:00 run sends a failed email again from what its row kept.
describe('EmailNotifier.retry', () => {
  const FAILED: LoggedEmail = {
    eventKey: EVENT.eventKey,
    template: 'content_scheduled',
    recipient: 'salsa@example.com',
    payload: { contentName: 'Evg_1', recipientName: 'Salsa Amelia' },
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the kept data again and sends it to the same recipient, never claiming a new row', async () => {
    const { store, sender, templates, notifier } = setup();

    await expect(notifier.retry(FAILED)).resolves.toBe(true);

    expect(store.claim).not.toHaveBeenCalled();
    expect(templates.render).toHaveBeenCalledWith('content_scheduled', FAILED.payload);
    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'salsa@example.com', senderName: 'Tofly' }),
    );
    expect(store.markSent).toHaveBeenCalledWith(EVENT.eventKey, 'salsa@example.com', NOW);
  });

  it('marks it failed again with the error kind, and never throws', async () => {
    const { store, log, notifier } = setup({ send: () => Promise.reject(new TypeError('down')) });

    await expect(notifier.retry(FAILED)).resolves.toBe(false);

    expect(store.markFailed).toHaveBeenCalledWith(
      EVENT.eventKey,
      'salsa@example.com',
      'TypeError',
      NOW,
    );
    expect(log.warn).toHaveBeenCalledWith('Email content_scheduled failed (TypeError)');
  });

  it('still waits 10 seconds at most', async () => {
    vi.useFakeTimers();
    const { store, notifier } = setup({ send: () => new Promise(() => {}) });

    const retrying = notifier.retry(FAILED);
    await vi.advanceTimersByTimeAsync(EMAIL_TIMEOUT_MS);

    await expect(retrying).resolves.toBe(false);
    expect(store.markFailed).toHaveBeenCalledWith(
      EVENT.eventKey,
      'salsa@example.com',
      'EmailTimeout',
      NOW,
    );
  });

  it('does not mark a sent email failed when only marking it sent fails', async () => {
    const { store, notifier } = setup();
    store.markSent.mockRejectedValue(new TypeError('connection lost'));

    await expect(notifier.retry(FAILED)).resolves.toBe(true);
    expect(store.markFailed).not.toHaveBeenCalled();
  });
});

// Review on #252: what the 08:00 run and the log need from a failed send.
describe('EmailNotifier, review follow-ups', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Gunta: nodemailer throws a plain Error, so its code (ESOCKET, EAUTH, ETIMEDOUT) is what tells
  // one SMTP failure from another. A code never names the address (OWASP A09).
  it('keeps the SMTP error code when the error carries one', async () => {
    const refusal = Object.assign(new Error('connect ECONNREFUSED to salsa@example.com'), {
      code: 'ESOCKET',
    });
    const { store, log, notifier } = setup({ send: () => Promise.reject(refusal) });

    await notifier.notify(EVENT);

    expect(store.markFailed).toHaveBeenCalledWith(EVENT.eventKey, 'salsa@example.com', 'ESOCKET', NOW);
    expect(log.warn).toHaveBeenCalledWith('Email content_scheduled failed (ESOCKET)');
  });

  it('falls back to the class name for a code that is not a plain error code', async () => {
    const refusal = Object.assign(new TypeError('bad'), { code: 'salsa@example.com' });
    const { store, notifier } = setup({ send: () => Promise.reject(refusal) });

    await notifier.notify(EVENT);

    expect(store.markFailed).toHaveBeenCalledWith(EVENT.eventKey, 'salsa@example.com', 'TypeError', NOW);
  });

  // Davin: while the templates (11.4) or the SMTP account are not set up, nothing was attempted,
  // so the 3 attempts are kept for when they are.
  it.each([
    ['the templates are not ready', 'render'],
    ['the SMTP account is not set up', 'send'],
  ] as const)('keeps every attempt when %s', async (_, step) => {
    const { store, templates, sender, notifier } = setup();
    if (step === 'render') {
      templates.render.mockImplementation(() => {
        throw new PortNotReady('Email templates are not ready');
      });
    } else {
      sender.send.mockRejectedValue(new PortNotReady('Email sending is not configured'));
    }

    await notifier.notify(EVENT);

    expect(store.markNotReady).toHaveBeenCalledWith(EVENT.eventKey, 'salsa@example.com', NOW);
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  // Davin: SMTP accepted it, so one more try at marking it sent keeps the log honest.
  it('tries once more to mark a sent email sent', async () => {
    const { store, notifier } = setup();
    store.markSent.mockRejectedValueOnce(new TypeError('connection lost'));

    await notifier.notify(EVENT);

    expect(store.markSent).toHaveBeenCalledTimes(2);
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  // Gunta: every Admin at once, so a slow mail server holds the request 10 seconds, not 10 per Admin.
  it('sends an event to all its recipients at once', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const { sender, notifier } = setup({ send: () => held });

    const sending = notifier.notifyAll({
      ...EVENT,
      to: [
        { email: 'rina@example.com', name: 'Rina' },
        { email: 'budi@example.com', name: 'Budi' },
      ],
    });
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledTimes(2));
    release();
    await sending;
  });
});
