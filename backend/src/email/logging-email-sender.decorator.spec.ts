import { PortNotReady } from '../auth/google/unready-ports.js';
import type { EmailMessage, EmailSender } from './email-sender.js';
import { LoggingEmailSenderDecorator } from './logging-email-sender.decorator.js';

const RECIPIENT = 'rangga@example.com';
const CODE = '123456';
const SMTP_PASSWORD = 'sixteen charact';

const MESSAGE: EmailMessage = {
  to: RECIPIENT,
  senderName: 'Tofly',
  subject: 'Kode masuk Tofly',
  text: `Kode kamu: ${CODE}`,
  html: `<p>Kode kamu: ${CODE}</p>`,
};

/** A provider error quoting everything the log must never repeat (OWASP-A04). */
const PROVIDER_ERROR_TEXT = `550 mailbox ${RECIPIENT} rejected "Kode kamu: ${CODE}" (auth ${SMTP_PASSWORD})`;

function setup() {
  // A mock of the wrapped sender (the component): the tests assert on what it was handed.
  const send = vi.fn<(message: EmailMessage) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const inner: EmailSender = { send };
  // A mock logger: the tests assert on every line written.
  const log = {
    log: vi.fn<(message: string) => void>(),
    warn: vi.fn<(message: string) => void>(),
  };
  const sender = new LoggingEmailSenderDecorator(inner, log);
  const logged = () =>
    [...log.log.mock.calls, ...log.warn.mock.calls].flat().join('\n');
  return { send, log, sender, logged };
}

describe('LoggingEmailSenderDecorator', () => {
  describe('when the wrapped sender accepts the message', () => {
    it('hands the very same message to the wrapped sender, once', async () => {
      const { send, sender } = setup();

      await sender.send(MESSAGE);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toBe(MESSAGE);
    });

    it('resolves and logs a single line that the email was accepted (OWASP-A09)', async () => {
      const { log, sender } = setup();

      await expect(sender.send(MESSAGE)).resolves.toBeUndefined();

      expect(log.log).toHaveBeenCalledExactlyOnceWith(
        'Email accepted for delivery',
      );
      expect(log.warn).not.toHaveBeenCalled();
    });
  });

  describe('when the wrapped sender refuses the message', () => {
    it('rethrows the very same error, so the caller still sees the failure (OWASP-A10)', async () => {
      const { send, sender } = setup();
      const error = new TypeError(PROVIDER_ERROR_TEXT);
      send.mockRejectedValueOnce(error);

      await expect(sender.send(MESSAGE)).rejects.toBe(error);
    });

    it('logs one warning naming the error kind only, and no success line (OWASP-A09)', async () => {
      const { send, log, sender } = setup();
      send.mockRejectedValueOnce(new TypeError(PROVIDER_ERROR_TEXT));

      await sender.send(MESSAGE).catch(() => undefined);

      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        'Email delivery failed (TypeError)',
      );
      expect(log.log).not.toHaveBeenCalled();
    });

    it("names the fail-closed sender's refusal by its kind", async () => {
      const { send, log, sender } = setup();
      const error = new PortNotReady('Email sending is not configured');
      send.mockRejectedValueOnce(error);

      await expect(sender.send(MESSAGE)).rejects.toBe(error);

      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        'Email delivery failed (PortNotReady)',
      );
    });

    it('also catches a wrapped sender that throws before returning a promise', async () => {
      const { send, log, sender } = setup();
      const error = new RangeError(PROVIDER_ERROR_TEXT);
      send.mockImplementationOnce(() => {
        throw error;
      });

      await expect(sender.send(MESSAGE)).rejects.toBe(error);

      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        'Email delivery failed (RangeError)',
      );
    });

    it.each([
      ['a string', PROVIDER_ERROR_TEXT, 'string'],
      ['undefined', undefined, 'undefined'],
      [
        'a plain object',
        { code: 'EAUTH', response: PROVIDER_ERROR_TEXT },
        'object',
      ],
    ])(
      'rethrows %s unchanged and logs only its type',
      async (_, thrown, kind) => {
        const { send, log, sender } = setup();
        send.mockImplementationOnce(() => Promise.reject(thrown));

        await expect(sender.send(MESSAGE)).rejects.toBe(thrown);

        expect(log.warn).toHaveBeenCalledExactlyOnceWith(
          `Email delivery failed (${kind})`,
        );
      },
    );
  });

  describe('what the log may hold (OWASP-A04)', () => {
    it.each([
      ['an accepted send', null],
      ['an Error', new Error(PROVIDER_ERROR_TEXT)],
      ['a thrown string', PROVIDER_ERROR_TEXT],
    ])(
      'never writes the recipient, the code, the bodies, the password or the provider text for %s',
      async (_, failure) => {
        const { send, sender, logged } = setup();
        if (failure !== null) {
          send.mockImplementationOnce(() => Promise.reject(failure));
        }

        await sender.send(MESSAGE).catch(() => undefined);

        const lines = logged();
        expect(lines).not.toBe('');
        for (const secret of [
          RECIPIENT,
          CODE,
          MESSAGE.text,
          MESSAGE.html,
          SMTP_PASSWORD,
          'mailbox',
          'EAUTH',
        ]) {
          expect(lines).not.toContain(secret);
        }
      },
    );
  });
});
