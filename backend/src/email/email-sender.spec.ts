import { PortNotReady } from '../auth/google/unready-ports.js';
import { EMAIL_SENDER, unreadyEmailSender } from './email-sender.js';

describe('unreadyEmailSender', () => {
  it('refuses every message until a real sender is bound, so nothing is lost silently', async () => {
    await expect(
      unreadyEmailSender.send({
        to: 'rangga@example.com',
        senderName: 'Tofly',
        subject: 'Kode masuk Tofly',
        text: 'body',
      }),
    ).rejects.toThrow(new PortNotReady('Email sending is not configured'));
  });

  it('is injected under its own token', () => {
    expect(EMAIL_SENDER).toBe('EMAIL_SENDER');
  });
});
