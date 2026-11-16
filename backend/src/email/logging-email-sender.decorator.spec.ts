import type { EmailMessage, EmailSender } from './email-sender.js';
import { LoggingEmailSenderDecorator } from './logging-email-sender.decorator.js';

const RECIPIENT = 'rangga@example.com';
const CODE = '123456';

const MESSAGE: EmailMessage = {
  to: RECIPIENT,
  senderName: 'Tofly',
  subject: 'Kode masuk Tofly',
  text: `Kode kamu: ${CODE}`,
  html: `<p>Kode kamu: ${CODE}</p>`,
};

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
  return { send, log, sender };
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
});
