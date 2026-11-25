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
