import { MAX_LINES, MAX_SUBJECT_LENGTH } from './notification-layout.js';
import { NOTIFICATION_SAMPLES } from './notification-samples.js';
import {
  NOTIFICATION_TEMPLATES,
  type NotificationTemplate,
} from './notification-templates.js';

const TEMPLATES = Object.keys(NOTIFICATION_TEMPLATES) as NotificationTemplate[];

/** The parts one template draws from its sample. */
function partsOf<T extends NotificationTemplate>(template: T) {
  const definition = NOTIFICATION_TEMPLATES[template];
  const data = NOTIFICATION_SAMPLES[template];
  return {
    audience: definition.audience,
    subject: definition.subject(data),
    lines: definition.lines(data),
    button: definition.button(data),
  };
}

describe('NOTIFICATION_TEMPLATES', () => {
  it('holds 21 templates: 18 for creators and 3 for Admins (11.4, PBI-16)', () => {
    const audiences = TEMPLATES.map(
      (template) => NOTIFICATION_TEMPLATES[template].audience,
    );

    expect(TEMPLATES).toHaveLength(21);
    expect(audiences.filter((audience) => audience === 'creator')).toHaveLength(
      18,
    );
    expect(audiences.filter((audience) => audience === 'admin')).toHaveLength(
      3,
    );
  });

  // The names 11.2's triggers and 11.3's run log: a template under any other name is never sent.
  it('answers every template name the triggers and the 08:00 run use', () => {
    expect([...TEMPLATES].sort()).toEqual(
      [
        'account_ready',
        'content_scheduled',
        'revision_requested',
        'follow_up_added',
        'draft_approved',
        'proposal_approved',
        'proposal_scheduled',
        'proposal_rejected',
        'content_rescheduled',
        'content_deleted',
        'invoice_finalized',
        'payment_proof_uploaded',
        'invoice_paid',
        'period_added',
        'contract_ended_early',
        'contract_end_changed',
        'quota_changed',
        'deadline_reminder',
        'draft_submitted',
        'proposal_submitted',
        'invoice_acknowledged',
      ].sort(),
    );
  });

  it('has a sample for every template and no sample without one, so the preview covers all', () => {
    expect(Object.keys(NOTIFICATION_SAMPLES).sort()).toEqual(
      [...TEMPLATES].sort(),
    );
  });

  describe.each(TEMPLATES)('%s (AC 7)', (template) => {
    const { audience, subject, lines, button } = partsOf(template);

    it(`has a subject of at most ${MAX_SUBJECT_LENGTH} characters`, () => {
      expect(subject.trim()).not.toBe('');
      expect([...subject].length).toBeLessThanOrEqual(MAX_SUBJECT_LENGTH);
    });

    it(`says it in one to ${MAX_LINES} lines`, () => {
      expect(lines.length).toBeGreaterThanOrEqual(1);
      expect(lines.length).toBeLessThanOrEqual(MAX_LINES);
      for (const line of lines) expect(line.trim()).not.toBe('');
    });

    it("opens one page of the recipient's own side of the app", () => {
      expect(button.label.trim()).not.toBe('');
      expect(
        button.path.startsWith(audience === 'admin' ? '/admin/' : '/'),
      ).toBe(true);
      if (audience === 'creator') {
        expect(button.path.startsWith('/admin')).toBe(false);
      }
    });
  });

  it('keeps every subject within the limit for the longest content name the app takes', () => {
    const long = 'x'.repeat(100);

    for (const template of TEMPLATES) {
      const definition = NOTIFICATION_TEMPLATES[template];
      const data = {
        ...NOTIFICATION_SAMPLES[template],
        contentName: long,
        creatorName: long,
      };
      const subject = (definition.subject as (input: typeof data) => string)(
        data,
      );
      expect([...subject].length, template).toBeLessThanOrEqual(
        MAX_SUBJECT_LENGTH,
      );
    }
  });

  it('opens the exact content in Task Saya for a creator, its id encoded', () => {
    const { button } = partsOf('content_scheduled');

    expect(button.path).toBe(
      `/creator/tasks?content=${NOTIFICATION_SAMPLES.content_scheduled.contentId}`,
    );
    expect(
      NOTIFICATION_TEMPLATES.content_scheduled.button({
        ...NOTIFICATION_SAMPLES.content_scheduled,
        contentId: 'a/b?c',
      }).path,
    ).toBe('/creator/tasks?content=a%2Fb%3Fc');
  });

  it.each(['draft_submitted', 'proposal_submitted'] as const)(
    'opens the exact content in the Content Plan for an Admin (%s)',
    (template) => {
      expect(partsOf(template).button.path).toBe(
        `/admin/content-plan?content=${NOTIFICATION_SAMPLES[template].contentId}`,
      );
    },
  );

  it('names the new deadline when Admin moves one (AC 1)', () => {
    expect(partsOf('content_rescheduled').lines).toContain(
      'Deadline baru: 5 Des 2026.',
    );
  });

  it('gives the reason a proposal was rejected, and leaves the line out when there is none (AC 1)', () => {
    expect(partsOf('proposal_rejected').lines).toContain(
      'Alasan: Belum sesuai rencana kampanye bulan ini.',
    );
    for (const reason of [null, '   ']) {
      expect(
        NOTIFICATION_TEMPLATES.proposal_rejected.lines({
          ...NOTIFICATION_SAMPLES.proposal_rejected,
          reason,
        }),
      ).toEqual(['Pengajuan konten Unboxing Paket Hemat ditolak Admin.']);
    }
  });

  it('writes an amount the way an invoice does', () => {
    expect(partsOf('invoice_finalized').lines[0]).toBe(
      'Invoice periode 2 sudah difinalisasi dengan total Rp1.250.000.',
    );
  });

  it('numbers the new contract period and gives its days (AC 1)', () => {
    expect(partsOf('period_added')).toMatchObject({
      subject: 'Periode kontrak baru mulai 1 Mar 2027',
      lines: [
        'Periode kontrak 3 kamu berjalan 1 Mar 2027 sampai 31 Mei 2027.',
        expect.any(String),
      ],
    });
  });

  // PBI-16: the creator learns the period's new end, and that what was scheduled stays.
  it('gives the period and its new end date', () => {
    expect(partsOf('contract_end_changed')).toEqual({
      audience: 'creator',
      subject: 'Akhir kontrak kamu kini 1 Mar 2027',
      lines: [
        'Periode kontrak 2 kamu kini berakhir 1 Mar 2027.',
        'Konten dan deadline yang sudah dijadwalkan tetap sama.',
      ],
      button: { label: 'Buka Dashboard', path: '/creator/dashboard' },
    });
  });

  it('gives the period and its new number of contents', () => {
    expect(partsOf('quota_changed')).toEqual({
      audience: 'creator',
      subject: 'Jumlah konten kontrak kamu kini 8',
      lines: [
        'Jumlah konten periode kontrak 2 kamu kini 8 konten.',
        'Konten tambahan muncul di Tugas Saya begitu dijadwalkan.',
      ],
      button: { label: 'Buka Tugas Saya', path: '/creator/tasks' },
    });
  });

  describe('invoice_paid (AC 3)', () => {
    it('attaches the invoice PDF it is given', () => {
      const attachments = NOTIFICATION_TEMPLATES.invoice_paid.attachments!(
        NOTIFICATION_SAMPLES.invoice_paid,
      );

      expect(attachments).toEqual([
        {
          filename: NOTIFICATION_SAMPLES.invoice_paid.invoicePdf.filename,
          content: NOTIFICATION_SAMPLES.invoice_paid.invoicePdf.content,
          contentType: 'application/pdf',
        },
      ]);
      expect(partsOf('invoice_paid').lines).toContain(
        'Invoice-nya terlampir di email ini.',
      );
    });

    it("says from which day access closes on a contract's last invoice", () => {
      expect(partsOf('invoice_paid').lines).toContain(
        'Kontrak kamu sudah berakhir, jadi akses Tofly ditutup mulai 1 Jan 2027.',
      );
    });

    it('says nothing about access while the contract goes on', () => {
      const lines = NOTIFICATION_TEMPLATES.invoice_paid.lines({
        ...NOTIFICATION_SAMPLES.invoice_paid,
        accessClosesOn: null,
      });

      expect(lines.join(' ')).not.toMatch(/akses/i);
    });
  });

  describe('contract_ended_early (AC 4, 10)', () => {
    it('gives the last day and that the invoice is paid', () => {
      expect(partsOf('contract_ended_early').lines).toEqual([
        'Kontrak kamu dengan Tofly berakhir lebih awal. Hari terakhirnya 15 Des 2026.',
        'Invoice periode ini sudah lunas.',
      ]);
    });

    it('says the invoice is Cancelled when it is', () => {
      expect(
        NOTIFICATION_TEMPLATES.contract_ended_early.lines({
          ...NOTIFICATION_SAMPLES.contract_ended_early,
          invoice: 'cancelled',
        }),
      ).toContain('Invoice periode ini dibatalkan (Cancelled).');
    });

    it('never shows a reason, even one passed in by mistake', () => {
      const leaked = {
        ...NOTIFICATION_SAMPLES.contract_ended_early,
        reason: 'Pelanggaran kontrak',
        note: 'Catatan internal Admin',
      };
      const definition = NOTIFICATION_TEMPLATES.contract_ended_early;
      const words = [
        definition.subject(leaked),
        ...definition.lines(leaked),
      ].join(' ');

      expect(words).not.toContain('Pelanggaran');
      expect(words).not.toContain('Catatan internal');
    });
  });

  it('reminds on H-1 that the link is still missing (AC 2)', () => {
    expect(partsOf('deadline_reminder')).toMatchObject({
      subject: 'Besok deadline: Promo Lebaran',
      lines: [
        'Deadline Promo Lebaran besok, 30 Nov 2026.',
        'Link videonya belum dikirim.',
      ],
    });
  });

  it('names the creator in every Admin email (AC 5)', () => {
    for (const template of TEMPLATES.filter(
      (name) => NOTIFICATION_TEMPLATES[name].audience === 'admin',
    )) {
      const { subject, lines } = partsOf(template);
      expect([subject, ...lines].join(' '), template).toContain(
        'Rangga Pratama',
      );
    }
  });
});
