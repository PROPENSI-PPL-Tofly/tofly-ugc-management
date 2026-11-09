import { Test } from '@nestjs/testing';
import { PortNotReady } from '../auth/google/unready-ports.js';
import { EMAIL_SENDER, type EmailSender } from './email-sender.js';
import { EmailModule } from './email.module.js';
import { SmtpEmailSender } from './smtp-email-sender.js';

const FULL_ENV = {
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '587',
  SMTP_USER: 'tofly.notify@gmail.com',
  SMTP_PASS: 'sixteen charact',
  EMAIL_FROM: 'tofly.notify@gmail.com',
};

async function builtSender(): Promise<EmailSender> {
  const module = await Test.createTestingModule({ imports: [EmailModule] }).compile();
  return module.get<EmailSender>(EMAIL_SENDER);
}

const MESSAGE = {
  to: 'rangga@example.com',
  senderName: 'Tofly',
  subject: 'Kode masuk Tofly',
  text: 'Kode kamu: 123456',
};

describe('EmailModule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('binds EMAIL_SENDER to the SMTP sender of the configured account', async () => {
    for (const [name, value] of Object.entries(FULL_ENV)) {
      vi.stubEnv(name, value);
    }

    expect(await builtSender()).toBeInstanceOf(SmtpEmailSender);
  });

  it('binds EMAIL_SENDER fail-closed while no account is configured, so no send is believed (AC 6)', async () => {
    for (const name of Object.keys(FULL_ENV)) {
      vi.stubEnv(name, '');
    }

    await expect(builtSender().then((sender) => sender.send(MESSAGE))).rejects.toThrow(
      PortNotReady,
    );
  });
});
