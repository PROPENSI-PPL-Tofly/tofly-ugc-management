import { NOTIFICATION_FOOTER } from './notification-layout.js';
import { notificationEmail } from './notification-email.js';
import { NOTIFICATION_SAMPLES } from './notification-samples.js';

const APP = 'https://tofly.example';

describe('notificationEmail (AC 7)', () => {
  it('answers the subject and both bodies, greeting the recipient by name, with no attachment', () => {
    const email = notificationEmail(
      'content_scheduled',
      NOTIFICATION_SAMPLES.content_scheduled,
      APP,
    );

    expect(email).toEqual({
      subject: 'Konten baru: Promo Lebaran',
      text: expect.stringContaining('Halo Rangga Pratama,'),
      html: expect.stringContaining('Halo Rangga Pratama,'),
    });
    expect(email.text).toContain(NOTIFICATION_FOOTER);
    expect(email.text).toContain(
      `Lihat Konten: ${APP}/creator/tasks?content=${NOTIFICATION_SAMPLES.content_scheduled.contentId}`,
    );
  });

  it('carries the invoice PDF on the Paid email (AC 3)', () => {
    const email = notificationEmail(
      'invoice_paid',
      NOTIFICATION_SAMPLES.invoice_paid,
      APP,
    );

    expect(email.attachments).toEqual([
      expect.objectContaining({
        filename: 'Invoice_RanggaPratama_Periode2.pdf',
        contentType: 'application/pdf',
      }),
    ]);
  });

  // The helper adds the recipient and the sender "Tofly" (11.1), so a template names neither.
  it('names no recipient and no sender', () => {
    const email = notificationEmail(
      'account_ready',
      NOTIFICATION_SAMPLES.account_ready,
      APP,
    );

    expect(email).not.toHaveProperty('to');
    expect(email).not.toHaveProperty('senderName');
  });
});
