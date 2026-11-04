import type { Logger } from '@nestjs/common';
import { smtpConfig } from './email-config.js';
import {
  SmtpEmailSender,
  emailSenderFromEnv,
  type MailTransport,
} from './smtp-email-sender.js';
import { PortNotReady } from '../auth/google/unready-ports.js';
import { unreadyEmailSender } from './email-sender.js';

const FULL_ENV = {
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '587',
  SMTP_USER: 'tofly.notify@gmail.com',
  SMTP_PASS: 'sixteen charact',
  EMAIL_FROM: 'tofly.notify@gmail.com',
};

const CONFIG = smtpConfig(FULL_ENV)!;

function transport() {
  return { sendMail: vi.fn().mockResolvedValue({ accepted: true }) };
}

function logger() {
  return { warn: vi.fn() } as unknown as Pick<Logger, 'warn'>;
}

const MESSAGE = {
  to: 'rangga@example.com',
  senderName: 'Tofly',
  subject: 'Kode masuk Tofly',
  text: 'Kode kamu: 123456',
  html: '<p>Kode kamu: 123456</p>',
};

describe('SmtpEmailSender', () => {
  it('delivers each message as Tofly from the configured address (AC 3)', async () => {
    const mail = transport();

    await new SmtpEmailSender(CONFIG, mail, logger()).send(MESSAGE);

    expect(mail.sendMail).toHaveBeenCalledWith({
      from: 'Tofly <tofly.notify@gmail.com>',
      to: 'rangga@example.com',
      subject: 'Kode masuk Tofly',
      text: 'Kode kamu: 123456',
      html: '<p>Kode kamu: 123456</p>',
    });
  });

  it('leaves the HTML body out of a message that has none', async () => {
    const mail = transport();

    await new SmtpEmailSender(CONFIG, mail, logger()).send({
      to: 'rangga@example.com',
      senderName: 'Tofly',
      subject: 'Kode masuk Tofly',
      text: 'Kode kamu: 123456',
    });

    expect(mail.sendMail).toHaveBeenCalledWith({
      from: 'Tofly <tofly.notify@gmail.com>',
      to: 'rangga@example.com',
      subject: 'Kode masuk Tofly',
      text: 'Kode kamu: 123456',
    });
  });

  it('reports a refused send to the caller and logs it without the code or the error\'s text (AC 6)', async () => {
    const mail = transport();
    const log = logger();
    mail.sendMail.mockRejectedValue(new Error('Invalid login: 535 5.7.8'));

    await expect(
      new SmtpEmailSender(CONFIG, mail, log).send(MESSAGE),
    ).rejects.toThrow('Invalid login: 535 5.7.8');

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('rangga@example.com'),
    );
    expect(log.warn).not.toHaveBeenCalledWith(expect.stringContaining('123456'));
    expect(log.warn).not.toHaveBeenCalledWith(expect.stringContaining('Invalid login'));
  });
});

describe('emailSenderFromEnv', () => {
  it('builds the real sender around the transport its account asks for', async () => {
    const mail = transport();
    const sender = emailSenderFromEnv(FULL_ENV, () => mail, logger());

    await sender.send(MESSAGE);

    expect(mail.sendMail).toHaveBeenCalledTimes(1);
  });

  it('is the fail-closed unready sender while no account is configured', async () => {
    const sender = emailSenderFromEnv({}, () => transport(), logger());

    expect(sender).toBe(unreadyEmailSender);
    await expect(sender.send(MESSAGE)).rejects.toThrow(PortNotReady);
  });
});
