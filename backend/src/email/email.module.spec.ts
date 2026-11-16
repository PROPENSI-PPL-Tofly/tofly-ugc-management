import { Test } from '@nestjs/testing';
import { createTransport } from 'nodemailer';
import { PortNotReady } from '../auth/google/unready-ports.js';
import { EMAIL_SENDER, type EmailSender } from './email-sender.js';
import { EMAIL_LOG, EmailModule } from './email.module.js';
import { LoggingEmailSenderDecorator } from './logging-email-sender.decorator.js';

// A stub of nodemailer: no SMTP connection is ever opened by these tests.
vi.mock('nodemailer', () => ({ createTransport: vi.fn() }));

const FULL_ENV = {
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '587',
  SMTP_USER: 'tofly.notify@gmail.com',
  SMTP_PASS: 'sixteen charact',
  EMAIL_FROM: 'tofly.notify@gmail.com',
};

const MESSAGE = {
  to: 'rangga@example.com',
  senderName: 'Tofly',
  subject: 'Kode masuk Tofly',
  text: 'Kode kamu: 123456',
};

function logger() {
  return { log: vi.fn(), warn: vi.fn() };
}

/** The sender Nest injects as EMAIL_SENDER, with EMAIL_LOG swapped for a mock logger. */
async function builtSender(
  log: ReturnType<typeof logger>,
): Promise<EmailSender> {
  const module = await Test.createTestingModule({ imports: [EmailModule] })
    .overrideProvider(EMAIL_LOG)
    .useValue(log)
    .compile();
  return module.get<EmailSender>(EMAIL_SENDER);
}

function configureSmtp(sendMail: ReturnType<typeof vi.fn>) {
  for (const [name, value] of Object.entries(FULL_ENV)) {
    vi.stubEnv(name, value);
  }
  vi.mocked(createTransport).mockReturnValue({ sendMail } as never);
}

describe('EmailModule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(createTransport).mockReset();
  });

  it('binds EMAIL_SENDER to the logging decorator around the configured SMTP sender', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    configureSmtp(sendMail);
    const log = logger();

    const sender = await builtSender(log);
    await sender.send(MESSAGE);

    expect(sender).toBeInstanceOf(LoggingEmailSenderDecorator);
    expect(sendMail).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        from: 'Tofly <tofly.notify@gmail.com>',
        to: 'rangga@example.com',
      }),
    );
    expect(log.log).toHaveBeenCalledExactlyOnceWith(
      'Email accepted for delivery',
    );
  });

  it('logs a refused SMTP send exactly once, by kind only, and still rejects (OWASP-A09)', async () => {
    configureSmtp(vi.fn().mockRejectedValue(new Error('Invalid login: 535')));
    const log = logger();

    await expect(
      builtSender(log).then((sender) => sender.send(MESSAGE)),
    ).rejects.toThrow('Invalid login: 535');

    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      'Email delivery failed (Error)',
    );
  });

  it('binds EMAIL_SENDER fail-closed while no account is configured, and logs the refusal (AC 6)', async () => {
    for (const name of Object.keys(FULL_ENV)) {
      vi.stubEnv(name, '');
    }
    const log = logger();

    await expect(
      builtSender(log).then((sender) => sender.send(MESSAGE)),
    ).rejects.toThrow(PortNotReady);

    expect(createTransport).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      'Email delivery failed (PortNotReady)',
    );
  });
});
