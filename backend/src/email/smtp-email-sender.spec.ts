import { smtpConfig } from './email-config.js';
import {
  SmtpEmailSender,
  emailSenderFromEnv,
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

    await new SmtpEmailSender(CONFIG, mail).send(MESSAGE);

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

    await new SmtpEmailSender(CONFIG, mail).send({
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

  // PBI-11 AC 3: the Paid email carries the invoice PDF.
  it('hands the attachments on to the transport as they are', async () => {
    const mail = transport();
    const pdf = {
      filename: 'Invoice_RanggaPratama_Periode2.pdf',
      content: Buffer.from('%PDF-1.7'),
      contentType: 'application/pdf',
    };

    await new SmtpEmailSender(CONFIG, mail).send({ ...MESSAGE, attachments: [pdf] });

    expect(mail.sendMail).toHaveBeenCalledWith(expect.objectContaining({ attachments: [pdf] }));
  });

  // Logging a refused send is LoggingEmailSenderDecorator's job; this sender only delivers,
  // and has no logger to write a duplicate line (or the recipient's address) with.
  it('reports a refused send to the caller unchanged (AC 6)', async () => {
    const mail = transport();
    const error = new Error('Invalid login: 535 5.7.8');
    mail.sendMail.mockRejectedValue(error);

    await expect(new SmtpEmailSender(CONFIG, mail).send(MESSAGE)).rejects.toBe(error);
  });

  it('rethrows a failure that is not an Error unchanged', async () => {
    const mail = transport();
    mail.sendMail.mockRejectedValue('boom');

    await expect(new SmtpEmailSender(CONFIG, mail).send(MESSAGE)).rejects.toBe('boom');
  });
});

describe('emailSenderFromEnv', () => {
  it('builds the real sender around the transport its account asks for', async () => {
    const mail = transport();
    const sender = emailSenderFromEnv(FULL_ENV, () => mail);

    await sender.send(MESSAGE);

    expect(mail.sendMail).toHaveBeenCalledTimes(1);
  });

  it('is the fail-closed unready sender while no account is configured', async () => {
    const sender = emailSenderFromEnv({}, () => transport());

    expect(sender).toBe(unreadyEmailSender);
    await expect(sender.send(MESSAGE)).rejects.toThrow(PortNotReady);
  });
});
