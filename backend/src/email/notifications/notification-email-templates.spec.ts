import { PortNotReady } from '../../auth/google/unready-ports.js';
import type { ContractFacts } from './contract-facts.js';
import {
  NotificationEmailTemplates,
  UnknownNotificationTemplate,
  type InvoicePdfs,
} from './notification-email-templates.js';
import { InvalidNotificationPayload } from './notification-payload.js';

const APP = 'https://tofly.example';
const CONTRACT = '22222222-2222-4222-8222-222222222222';
const PDF = Buffer.from('%PDF-invoice');

function setup({ appUrl }: { appUrl: string | undefined } = { appUrl: APP }) {
  const facts = {
    period: vi
      .fn<ContractFacts['period']>()
      .mockResolvedValue({ periodNumber: 2 }),
    invoice: vi
      .fn<ContractFacts['invoice']>()
      .mockResolvedValue({ periodNumber: 2, total: 1_250_000 }),
  };
  const pdfs = {
    forContract: vi.fn<InvoicePdfs['forContract']>().mockResolvedValue({
      fileName: 'Invoice_RanggaPratama_Periode2.pdf',
      bytes: PDF,
    }),
  };
  const templates = new NotificationEmailTemplates(facts, pdfs, () => appUrl);
  return { facts, pdfs, templates };
}

describe('NotificationEmailTemplates (11.4, bound to 11.1’s EMAIL_TEMPLATES)', () => {
  it('renders an email from the data the trigger logged, its button on the app', async () => {
    const { facts, templates } = setup();

    const email = await templates.render('content_scheduled', {
      contentId: 'content-1',
      contentName: 'Promo Lebaran',
      deadline: '2026-11-30',
      recipientName: 'Rangga Pratama',
    });

    expect(email.subject).toBe('Konten baru: Promo Lebaran');
    expect(email.text).toContain('Halo Rangga Pratama,');
    expect(email.text).toContain(`${APP}/creator/tasks?content=content-1`);
    expect(email).not.toHaveProperty('attachments');
    expect(facts.period).not.toHaveBeenCalled();
    expect(facts.invoice).not.toHaveBeenCalled();
  });

  it.each(['payment_proof_uploaded', 'invoice_acknowledged'] as const)(
    'numbers the period of %s from its contract',
    async (template) => {
      const { facts, templates } = setup();

      const email = await templates.render(template, {
        contractId: CONTRACT,
        creatorName: 'Rangga',
      });

      expect(facts.period).toHaveBeenCalledWith(CONTRACT);
      expect(email.text).toContain('periode 2');
    },
  );

  it('numbers a new contract period from its contract (AC 1)', async () => {
    const { facts, templates } = setup();

    const email = await templates.render('period_added', {
      contractId: CONTRACT,
      startDate: '2027-03-01',
      endDate: '2027-05-31',
    });

    expect(facts.period).toHaveBeenCalledWith(CONTRACT);
    expect(email.text).toContain(
      'Periode kontrak 2 kamu berjalan 1 Mar 2027 sampai 31 Mei 2027.',
    );
  });

  it('gives a finalized invoice its period and total', async () => {
    const { facts, templates } = setup();

    const email = await templates.render('invoice_finalized', {
      contractId: CONTRACT,
    });

    expect(facts.invoice).toHaveBeenCalledWith(CONTRACT);
    expect(email.text).toContain(
      'Invoice periode 2 sudah difinalisasi dengan total Rp1.250.000.',
    );
  });

  describe('invoice_paid (AC 3)', () => {
    it('attaches the PBI-31 invoice PDF of that contract', async () => {
      const { pdfs, templates } = setup();

      const email = await templates.render('invoice_paid', {
        contractId: CONTRACT,
        accessClosesOn: '2027-01-01',
        recipientName: 'Rangga Pratama',
      });

      // No creator id: the helper is not a creator asking for a file, so no ownership check.
      expect(pdfs.forContract).toHaveBeenCalledWith(CONTRACT, {}, 'invoice');
      expect(email.attachments).toEqual([
        {
          filename: 'Invoice_RanggaPratama_Periode2.pdf',
          content: PDF,
          contentType: 'application/pdf',
        },
      ]);
      expect(email.text).toContain('akses Tofly ditutup mulai 1 Jan 2027');
    });

    it('fails when the PDF cannot be made, so the 08:00 run sends it with the PDF later', async () => {
      const { pdfs, templates } = setup();
      pdfs.forContract.mockRejectedValue(new Error('PDF gagal dibuat'));

      await expect(
        templates.render('invoice_paid', {
          contractId: CONTRACT,
          accessClosesOn: null,
        }),
      ).rejects.toThrow('PDF gagal dibuat');
    });
  });

  it('refuses a template it does not know, naming it', async () => {
    const { templates } = setup();

    await expect(templates.render('birthday', {})).rejects.toThrow(
      UnknownNotificationTemplate,
    );
    await expect(templates.render('birthday', {})).rejects.toThrow(
      'No email template birthday',
    );
  });

  it('refuses data the template cannot word', async () => {
    const { templates } = setup();

    await expect(
      templates.render('content_scheduled', { contentName: 'Promo' }),
    ).rejects.toThrow(InvalidNotificationPayload);
  });

  it.each([
    ['toString', 'a name every object has'],
    ['__proto__', 'the prototype'],
  ])('never takes %s (%s) for a template', async (name) => {
    const { templates } = setup();

    await expect(templates.render(name, {})).rejects.toThrow(
      UnknownNotificationTemplate,
    );
  });

  it('points the buttons at FRONTEND_URL when no address is handed in', async () => {
    vi.stubEnv('FRONTEND_URL', 'https://staging.tofly.example');
    const { facts, pdfs } = setup();

    const email = await new NotificationEmailTemplates(facts, pdfs).render(
      'account_ready',
      {},
    );

    expect(email.text).toContain(
      'Masuk ke Tofly: https://staging.tofly.example/login',
    );
    vi.unstubAllEnvs();
  });

  // No app address, no button: the email waits as not ready instead of going out with a dead link.
  it.each([undefined, '', '   '])(
    'is not ready while the app address is %j',
    async (appUrl) => {
      const { templates } = setup({ appUrl });

      await expect(templates.render('account_ready', {})).rejects.toThrow(
        PortNotReady,
      );
    },
  );
});
