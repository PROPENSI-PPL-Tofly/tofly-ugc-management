import type {
  NotificationData,
  NotificationTemplate,
} from './notification-templates.js';

// One realistic set of data per template: what the preview script renders and what the template
// tests read. Not used to send anything.

const CONTENT_ID = '3f1c2b9a-8d4e-4f6a-9b2c-1e5d7a8c9f01';

const RANGGA = 'Rangga Pratama';

/** Admins have no name yet, so the helper greets them by their address (11.2). */
const ADMIN = 'dewi@tofly.id';

const PROMO = {
  recipientName: RANGGA,
  contentId: CONTENT_ID,
  contentName: 'Promo Lebaran',
};

const UNBOXING = {
  recipientName: RANGGA,
  contentId: CONTENT_ID,
  contentName: 'Unboxing Paket Hemat',
};

/** A stand-in for the PBI-31 invoice PDF: only its name and size matter to an email. */
const SAMPLE_PDF = Buffer.from(
  '%PDF-1.7\n% sample invoice for the email preview\n',
);

export const NOTIFICATION_SAMPLES: {
  [T in NotificationTemplate]: NotificationData[T];
} = {
  account_ready: { recipientName: RANGGA },
  content_scheduled: { ...PROMO, deadline: '2026-11-30' },
  revision_requested: PROMO,
  follow_up_added: PROMO,
  draft_approved: PROMO,
  proposal_approved: UNBOXING,
  proposal_scheduled: UNBOXING,
  proposal_rejected: {
    recipientName: RANGGA,
    contentName: 'Unboxing Paket Hemat',
    reason: 'Belum sesuai rencana kampanye bulan ini.',
  },
  content_rescheduled: { ...PROMO, deadline: '2026-12-05' },
  content_deleted: {
    recipientName: RANGGA,
    contentName: 'Promo Lebaran',
    deadline: '2026-11-30',
  },
  invoice_finalized: { recipientName: RANGGA, periodNumber: 2, total: 1250000 },
  payment_proof_uploaded: { recipientName: RANGGA, periodNumber: 2 },
  invoice_paid: {
    recipientName: RANGGA,
    periodNumber: 2,
    total: 1250000,
    invoicePdf: {
      filename: 'Invoice_RanggaPratama_Periode2.pdf',
      content: SAMPLE_PDF,
    },
    accessClosesOn: '2027-01-01',
  },
  period_added: {
    recipientName: RANGGA,
    periodNumber: 3,
    startDate: '2027-03-01',
    endDate: '2027-05-31',
  },
  contract_ended_early: {
    recipientName: RANGGA,
    lastDay: '2026-12-15',
    invoice: 'paid',
  },
  deadline_reminder: { ...PROMO, deadline: '2026-11-30' },
  draft_submitted: { ...PROMO, recipientName: ADMIN, creatorName: RANGGA },
  proposal_submitted: {
    ...UNBOXING,
    recipientName: ADMIN,
    creatorName: RANGGA,
    deadline: '2026-12-10',
  },
  invoice_acknowledged: {
    recipientName: ADMIN,
    creatorName: RANGGA,
    periodNumber: 2,
  },
};
