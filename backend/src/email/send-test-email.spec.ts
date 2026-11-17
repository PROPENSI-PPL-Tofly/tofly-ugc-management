import { sendTestEmail } from './send-test-email.js';

const FULL_ENV = {
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '587',
  SMTP_USER: 'tofly.notify@gmail.com',
  SMTP_PASS: 'sixteen charact',
  EMAIL_FROM: 'tofly.notify@gmail.com',
};

describe('sendTestEmail', () => {
  it('delivers one sign-in-code email to the address it is given (AC 3)', async () => {
    const mail = { sendMail: vi.fn().mockResolvedValue({}) };

    await sendTestEmail('rangga@example.com', FULL_ENV, () => mail);

    expect(mail.sendMail).toHaveBeenCalledTimes(1);
    expect(mail.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Tofly <tofly.notify@gmail.com>',
        to: 'rangga@example.com',
        subject: 'Kode masuk Tofly',
      }),
    );
    expect(mail.sendMail.mock.calls[0][0].text).toContain('Kode kamu');
    expect(mail.sendMail.mock.calls[0][0].html).toContain('Kode kamu');
  });

  it('reports a failed send to whoever ran it', async () => {
    const mail = { sendMail: vi.fn().mockRejectedValue(new Error('Invalid login')) };

    await expect(sendTestEmail('rangga@example.com', FULL_ENV, () => mail)).rejects.toThrow(
      'Invalid login',
    );
  });
});
