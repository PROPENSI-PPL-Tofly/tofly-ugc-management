import { readableDay } from '../../creators/evergreen.js';
import type { EmailAttachment } from '../email-sender.js';
import { fitSubject } from './notification-layout.js';

// The 19 notification emails of PBI-11 (11.4): 16 for creators (AC 1–4) and 3 for Admins (AC 5).
// One entry per email in one table, each saying only its subject, lines and button; the layout
// (notification-layout.ts) draws them all alike. A new email is a new entry here, and nothing
// else changes (Open/Closed). The keys are the template names 11.2's triggers and 11.3's run
// already log (creator-emails.ts, admin-emails.ts, daily-email-run.service.ts).
//
// [Security] AC 10: no template takes a token, an Admin-only note or the early-end reason, so
// none can be put into an email, however a trigger is written.

/** A plain calendar day, `YYYY-MM-DD`. */
type Day = string;

interface Recipient {
  /** The person greeted, as the helper adds it (11.1); null greets without a name. */
  recipientName: string | null;
}

interface ContentFacts extends Recipient {
  contentId: string;
  contentName: string;
}

interface ScheduledContent extends ContentFacts {
  deadline: Day;
}

/** What 11.4's adapter reads for an invoice email beside the contract id the trigger sends. */
export interface PeriodFacts {
  /** The period's number as the creator's Pembayaran counts it (1 for the first contract). */
  periodNumber: number;
}

export interface InvoiceFacts extends PeriodFacts {
  /** The invoice total saved at Finalize, in rupiah. */
  total: number;
}

/** What each email is given, by template: the trigger's data, plus the facts 11.4 reads. */
export interface NotificationData {
  // Creator emails (AC 1)
  account_ready: Recipient;
  content_scheduled: ScheduledContent;
  revision_requested: ContentFacts;
  /** Admin added a follow-up note to a revision. */
  follow_up_added: ContentFacts;
  draft_approved: ContentFacts;
  proposal_approved: ContentFacts;
  /** A proposal still undecided at H-1 was scheduled by the system (PBI-14 AC 7). */
  proposal_scheduled: ContentFacts;
  /** The proposal is gone, so only its name is kept; the reason is the one Admin wrote for the creator. */
  proposal_rejected: Recipient & { contentName: string; reason: string | null };
  /** Admin moved the deadline; `deadline` is the new one. */
  content_rescheduled: ScheduledContent;
  /** The content is gone, so there is no id to open. */
  content_deleted: Recipient & { contentName: string; deadline: Day };
  invoice_finalized: Recipient & InvoiceFacts;
  payment_proof_uploaded: Recipient & PeriodFacts;
  /** AC 3: the PBI-31 invoice PDF, and the day access closes on a contract's last invoice. */
  invoice_paid: Recipient &
    InvoiceFacts & {
      invoicePdf: { filename: string; content: Buffer };
      accessClosesOn: Day | null;
    };
  period_added: Recipient & PeriodFacts & { startDate: Day; endDate: Day };
  /** AC 4: the last day and the invoice's outcome, never the reason type or note. */
  contract_ended_early: Recipient & {
    lastDay: Day;
    invoice: 'paid' | 'cancelled';
  };
  // AC 2: the 08:00 WIB reminder on H-1 for content with no link yet.
  deadline_reminder: ScheduledContent;
  // Admin emails (AC 5)
  draft_submitted: ContentFacts & { creatorName: string };
  proposal_submitted: ScheduledContent & { creatorName: string };
  invoice_acknowledged: Recipient & PeriodFacts & { creatorName: string };
}

export type NotificationTemplate = keyof NotificationData;

export interface TemplateDefinition<D> {
  audience: 'creator' | 'admin';
  subject(data: D): string;
  lines(data: D): string[];
  button(data: D): { label: string; path: string };
  attachments?(data: D): EmailAttachment[];
}

type Templates = {
  [T in NotificationTemplate]: TemplateDefinition<NotificationData[T]>;
};

const RUPIAH = new Intl.NumberFormat('id-ID');

/** An amount as the invoice writes it, e.g. `Rp1.250.000`. */
function rupiah(value: number): string {
  return `Rp${RUPIAH.format(value)}`;
}

const day = readableDay;

/** The content's own panel in Task Saya, which `?content=` opens (my-task-board.tsx). */
function taskPath(contentId: string): string {
  return `/creator/tasks?content=${encodeURIComponent(contentId)}`;
}

/** The content's panel in the Admin's Content Plan, which `?content=` opens. */
function contentPlanPath(contentId: string): string {
  return `/admin/content-plan?content=${encodeURIComponent(contentId)}`;
}

const TASKS = { label: 'Lihat Task Saya', path: '/creator/tasks' };
const PAYMENTS = '/creator/payments';

/** A creator email about one content item: its subject prefix, its lines and its button label. */
function contentEmail<D extends ContentFacts>(
  prefix: string,
  lines: (data: D) => string[],
  label = 'Lihat Konten',
): TemplateDefinition<D> {
  return {
    audience: 'creator',
    subject: (data) => fitSubject(prefix, data.contentName),
    lines,
    button: (data) => ({ label, path: taskPath(data.contentId) }),
  };
}

export const NOTIFICATION_TEMPLATES: Templates = {
  account_ready: {
    audience: 'creator',
    subject: () => 'Akun Tofly kamu sudah siap',
    lines: () => [
      'Akun Tofly kamu sudah dibuat oleh Admin.',
      'Masuk dengan akun Google atau kode yang dikirim ke email ini.',
    ],
    button: () => ({ label: 'Masuk ke Tofly', path: '/login' }),
  },

  content_scheduled: contentEmail('Konten baru: ', (data) => [
    `Admin menjadwalkan konten ${data.contentName} untukmu.`,
    `Deadline: ${day(data.deadline)}.`,
  ]),

  revision_requested: contentEmail(
    'Draft perlu revisi: ',
    (data) => [
      `Admin meminta revisi untuk draft ${data.contentName}.`,
      'Baca catatannya, lalu kirim draft baru.',
    ],
    'Lihat Catatan Revisi',
  ),

  follow_up_added: contentEmail(
    'Catatan revisi diperbarui: ',
    (data) => [
      `Admin menambahkan catatan susulan untuk draft ${data.contentName}.`,
    ],
    'Lihat Catatan Revisi',
  ),

  draft_approved: contentEmail(
    'Draft disetujui: ',
    (data) => [
      `Draft ${data.contentName} disetujui Admin.`,
      'Unggah videonya, lalu kirim link-nya sebelum deadline.',
    ],
    'Kirim Link Video',
  ),

  proposal_approved: contentEmail('Pengajuan disetujui: ', (data) => [
    `Pengajuan konten ${data.contentName} disetujui Admin.`,
    'Konten ini sekarang ada di Task Saya.',
  ]),

  proposal_scheduled: contentEmail('Pengajuan dijadwalkan: ', (data) => [
    `Pengajuan konten ${data.contentName} belum diputuskan Admin sampai H-1, jadi otomatis dijadwalkan.`,
    'Konten ini sekarang ada di Task Saya.',
  ]),

  proposal_rejected: {
    audience: 'creator',
    subject: (data) => fitSubject('Pengajuan ditolak: ', data.contentName),
    lines: (data) => [
      `Pengajuan konten ${data.contentName} ditolak Admin.`,
      ...(data.reason?.trim() ? [`Alasan: ${data.reason.trim()}`] : []),
    ],
    button: () => TASKS,
  },

  content_rescheduled: contentEmail('Deadline diubah: ', (data) => [
    `Admin mengubah deadline ${data.contentName}.`,
    `Deadline baru: ${day(data.deadline)}.`,
  ]),

  content_deleted: {
    audience: 'creator',
    subject: (data) => fitSubject('Konten dihapus: ', data.contentName),
    lines: (data) => [
      `Admin menghapus konten ${data.contentName} (deadline ${day(data.deadline)}).`,
      'Konten ini tidak perlu dikerjakan lagi.',
    ],
    button: () => TASKS,
  },

  invoice_finalized: {
    audience: 'creator',
    subject: (data) => `Invoice periode ${data.periodNumber} siap dicek`,
    lines: (data) => [
      `Invoice periode ${data.periodNumber} sudah difinalisasi dengan total ${rupiah(data.total)}.`,
      'Cek rinciannya, lalu konfirmasi supaya Admin bisa membayar.',
    ],
    button: () => ({ label: 'Cek Invoice', path: PAYMENTS }),
  },

  payment_proof_uploaded: {
    audience: 'creator',
    subject: (data) =>
      `Bukti pembayaran periode ${data.periodNumber} sudah diunggah`,
    lines: (data) => [
      `Admin mengunggah bukti pembayaran invoice periode ${data.periodNumber}.`,
      'Cek rekeningmu, lalu konfirmasi pembayarannya sudah diterima.',
    ],
    button: () => ({ label: 'Konfirmasi Pembayaran', path: PAYMENTS }),
  },

  invoice_paid: {
    audience: 'creator',
    subject: (data) => `Pembayaran periode ${data.periodNumber} selesai`,
    lines: (data) => [
      `Invoice periode ${data.periodNumber} sebesar ${rupiah(data.total)} sudah lunas.`,
      'Invoice-nya terlampir di email ini.',
      ...(data.accessClosesOn
        ? [
            `Kontrak kamu sudah berakhir, jadi akses Tofly ditutup mulai ${day(data.accessClosesOn)}.`,
          ]
        : []),
    ],
    button: () => ({ label: 'Lihat Pembayaran', path: PAYMENTS }),
    attachments: (data) => [
      {
        filename: data.invoicePdf.filename,
        content: data.invoicePdf.content,
        contentType: 'application/pdf',
      },
    ],
  },

  period_added: {
    audience: 'creator',
    subject: (data) => `Periode kontrak baru mulai ${day(data.startDate)}`,
    lines: (data) => [
      `Periode kontrak ${data.periodNumber} kamu berjalan ${day(data.startDate)} sampai ${day(data.endDate)}.`,
      'Jadwal kontennya bisa dilihat di Tofly.',
    ],
    button: () => ({ label: 'Buka Dashboard', path: '/creator/dashboard' }),
  },

  contract_ended_early: {
    audience: 'creator',
    subject: (data) => `Kontrak kamu berakhir ${day(data.lastDay)}`,
    // Built from the last day and the invoice outcome alone: a reason handed in is never read.
    lines: (data) => [
      `Kontrak kamu dengan Tofly berakhir lebih awal. Hari terakhirnya ${day(data.lastDay)}.`,
      data.invoice === 'paid'
        ? 'Invoice periode ini sudah lunas.'
        : 'Invoice periode ini dibatalkan (Cancelled).',
    ],
    button: () => ({ label: 'Lihat Pembayaran', path: PAYMENTS }),
  },

  deadline_reminder: contentEmail('Besok deadline: ', (data) => [
    `Deadline ${data.contentName} besok, ${day(data.deadline)}.`,
    'Link videonya belum dikirim.',
  ]),

  draft_submitted: {
    audience: 'admin',
    subject: (data) => fitSubject('Draft menunggu review: ', data.contentName),
    lines: (data) => [
      `${data.creatorName} mengirim draft ${data.contentName}.`,
      'Setujui atau minta revisi di Tofly.',
    ],
    button: (data) => ({
      label: 'Review Draft',
      path: contentPlanPath(data.contentId),
    }),
  },

  proposal_submitted: {
    audience: 'admin',
    subject: (data) => fitSubject('Pengajuan konten dari ', data.creatorName),
    lines: (data) => [
      `${data.creatorName} mengajukan konten ${data.contentName} dengan deadline ${day(data.deadline)}.`,
      'Setujui atau tolak sebelum H-1. Kalau tidak, konten ini dijadwalkan otomatis.',
    ],
    button: (data) => ({
      label: 'Tinjau Pengajuan',
      path: contentPlanPath(data.contentId),
    }),
  },

  invoice_acknowledged: {
    audience: 'admin',
    subject: (data) => fitSubject('Invoice siap dibayar: ', data.creatorName),
    lines: (data) => [
      `${data.creatorName} sudah mengecek invoice periode ${data.periodNumber}.`,
      'Transfer pembayarannya, lalu unggah buktinya di Tofly.',
    ],
    button: () => ({
      label: 'Buka Rate & Invoicing',
      path: '/admin/invoicing',
    }),
  },
};
