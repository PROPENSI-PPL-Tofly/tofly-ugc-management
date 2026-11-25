import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoicePdfService,
  invoicePdfFileName,
  type PdfRenderers,
} from './invoice-pdf.service.js';

const CONTRACT = '22222222-2222-4222-8222-222222222222';
const CREATOR = '11111111-1111-4111-8111-111111111111';

const SNAPSHOT = {
  fixedRate: { amount: 1_250_000, status: 'calculated', lines: [] },
  additionalContent: { amount: 0, status: 'calculated', lines: [] },
  performanceBonus: { amount: 0, status: 'calculated', lines: [] },
  penalty: { amount: 0, status: 'calculated', lines: [] },
  adjustments: [],
  rawTotal: 1_250_000,
  total: 1_250_000,
  floored: false,
  finalizedAt: '2026-10-01T03:00:00Z',
};

function row(invoice: Record<string, unknown> | null = {}) {
  return {
    id: CONTRACT,
    creator_id: CREATOR,
    start_date: new Date('2026-06-01T00:00:00Z'),
    end_date: new Date('2026-09-30T00:00:00Z'),
    creators: {
      first_name: 'Rangga',
      middle_name: null,
      last_name: 'Pratama',
      users: { email: 'rangga@example.com' },
      contracts: [{ id: 'first' }, { id: CONTRACT }, { id: 'third' }],
    },
    invoice:
      invoice === null
        ? null
        : {
            status: 'paid',
            snapshot: SNAPSHOT,
            invoice_number: 'TOF-INV-202610-001',
            receipt_number: 'TOF-RCP-202610-004',
            finalized_at: new Date('2026-10-01T03:00:00Z'),
            acknowledged_at: new Date('2026-10-02T03:00:00Z'),
            paid_at: new Date('2026-10-05T03:00:00Z'),
            payment_proof: { uploaded_at: new Date('2026-10-04T03:00:00Z') },
            ...invoice,
          },
  };
}

function setup(found: unknown = row()) {
  const prisma = { contracts: { findUnique: vi.fn().mockResolvedValue(found) } };
  const renderers = {
    invoice: vi.fn().mockResolvedValue(Buffer.from('%PDF-invoice')),
    receipt: vi.fn().mockResolvedValue(Buffer.from('%PDF-receipt')),
  } satisfies PdfRenderers;
  return { prisma, renderers, service: new InvoicePdfService(prisma as never, renderers) };
}

const EXPECTED_DATA = {
  invoiceNumber: 'TOF-INV-202610-001',
  receiptNumber: 'TOF-RCP-202610-004',
  creatorName: 'Rangga Pratama',
  creatorEmail: 'rangga@example.com',
  periodNumber: 2,
  periodStart: '2026-06-01',
  periodEnd: '2026-09-30',
  status: 'paid',
  finalizedAt: '2026-10-01T03:00:00.000Z',
  acknowledgedAt: '2026-10-02T03:00:00.000Z',
  proofUploadedAt: '2026-10-04T03:00:00.000Z',
  paidAt: '2026-10-05T03:00:00.000Z',
  snapshot: SNAPSHOT,
};

describe('invoicePdfFileName (AC 5)', () => {
  it('names the file after the document, the creator with spaces dropped, and the period', () => {
    expect(invoicePdfFileName('invoice', 'Rangga Pratama', 2)).toBe('Invoice_RanggaPratama_Periode2.pdf');
    expect(invoicePdfFileName('receipt', 'Rangga Pratama', 2)).toBe('Receipt_RanggaPratama_Periode2.pdf');
  });

  it('keeps only letters, digits, dots, dashes and underscores from the name', () => {
    expect(invoicePdfFileName('invoice', 'Ayu "Dewi"/../x', 1)).toBe('Invoice_AyuDewi..x_Periode1.pdf');
  });

  it('keeps letters beyond ASCII, which the header encodes', () => {
    expect(invoicePdfFileName('invoice', 'Siti Nurhalizá', 1)).toBe('Invoice_SitiNurhalizá_Periode1.pdf');
  });
});

describe('InvoicePdfService.forContract', () => {
  it('renders the frozen invoice with its number, creator, period and every date', async () => {
    const { renderers, service } = setup();

    const file = await service.forContract(CONTRACT, {}, 'invoice');

    expect(file).toEqual({ fileName: 'Invoice_RanggaPratama_Periode2.pdf', bytes: Buffer.from('%PDF-invoice') });
    expect(renderers.invoice).toHaveBeenCalledWith(EXPECTED_DATA);
    expect(renderers.receipt).not.toHaveBeenCalled();
  });

  it('renders the receipt from the same data', async () => {
    const { renderers, service } = setup();

    const file = await service.forContract(CONTRACT, {}, 'receipt');

    expect(file).toEqual({ fileName: 'Receipt_RanggaPratama_Periode2.pdf', bytes: Buffer.from('%PDF-receipt') });
    expect(renderers.receipt).toHaveBeenCalledWith(EXPECTED_DATA);
  });

  it("reads the period number from the order the creator's contracts started", async () => {
    const { prisma, service } = setup();

    await service.forContract(CONTRACT, {}, 'invoice');

    expect(prisma.contracts.findUnique.mock.calls[0][0].select.creators.select.contracts).toEqual({
      select: { id: true },
      orderBy: [{ start_date: 'asc' }, { id: 'asc' }],
    });
  });

  // Agreed 25 Nov 2026: the invoice once the creator acknowledged it, when no adjustment can
  // change it any more (PBI-28 AC 11); the receipt once the creator confirmed the payment.
  it.each(['creator_acked', 'payment_uploaded', 'paid'] as const)('lets a %s invoice be downloaded', async (status) => {
    const { renderers, service } = setup(row({ status }));

    await service.forContract(CONTRACT, {}, 'invoice');

    expect(renderers.invoice.mock.calls[0][0].status).toBe(status);
  });

  it.each([
    ['has no invoice row yet', null],
    ['is still running', { status: 'running', snapshot: null, invoice_number: null }],
    ['is finalized but not acknowledged, so an adjustment can still change it', { status: 'finalized' }],
  ])('refuses the invoice of a contract that %s', async (_label, invoice) => {
    const { renderers, service } = setup(row(invoice));

    const error = await service.forContract(CONTRACT, {}, 'invoice').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'INVOICE_PDF_UNAVAILABLE',
      message: 'Invoice bisa diunduh setelah creator meng-acknowledge',
    });
    expect(renderers.invoice).not.toHaveBeenCalled();
  });

  it.each(['finalized', 'creator_acked', 'payment_uploaded'] as const)(
    'refuses the receipt of a %s invoice, which is not paid yet',
    async (status) => {
      const { renderers, service } = setup(row({ status }));

      const error = await service.forContract(CONTRACT, {}, 'receipt').catch((e: unknown) => e);

      expect((error as ConflictException).getResponse()).toEqual({
        code: 'RECEIPT_PDF_UNAVAILABLE',
        message: 'Receipt bisa diunduh setelah pembayaran dikonfirmasi creator',
      });
      expect(renderers.receipt).not.toHaveBeenCalled();
    },
  );

  it('lets a creator download their own invoice', async () => {
    const { service } = setup();

    await expect(service.forContract(CONTRACT, { creatorId: CREATOR }, 'invoice')).resolves.toMatchObject({
      fileName: 'Invoice_RanggaPratama_Periode2.pdf',
    });
  });

  // OWASP Top 10:2025 A01 (Broken Access Control), AC 6.
  it.each(['invoice', 'receipt'] as const)(
    "refuses a creator another creator's %s with 403, and renders nothing",
    async (document) => {
      const { renderers, service } = setup();

      await expect(
        service.forContract(CONTRACT, { creatorId: '99999999-9999-4999-8999-999999999999' }, document),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(renderers[document]).not.toHaveBeenCalled();
    },
  );

  it('answers 404 for a contract that does not exist', async () => {
    const { service } = setup(null);

    await expect(service.forContract(CONTRACT, {}, 'invoice')).rejects.toBeInstanceOf(NotFoundException);
  });

  // OWASP Top 10:2025 A10: an issued invoice missing its snapshot or number fails closed.
  it.each([
    ['its snapshot', { snapshot: null }, 'invoice'],
    ['its number', { invoice_number: null }, 'invoice'],
    ['its receipt number', { receipt_number: null }, 'receipt'],
  ] as const)('refuses a paid invoice without %s', async (_label, invoice, document) => {
    const { service } = setup(row(invoice));

    await expect(service.forContract(CONTRACT, {}, document)).rejects.toBeInstanceOf(ConflictException);
  });

  it('sends no receipt number while there is no receipt', async () => {
    const { renderers, service } = setup(row({ status: 'creator_acked', receipt_number: null, paid_at: null }));

    await service.forContract(CONTRACT, {}, 'invoice');

    expect(renderers.invoice.mock.calls[0][0].receiptNumber).toBeNull();
  });

  it("falls back to the snapshot's moment when finalized_at was not recorded, and to none for a missing proof", async () => {
    const { renderers, service } = setup(row({ finalized_at: null, payment_proof: null }));

    await service.forContract(CONTRACT, {}, 'invoice');

    expect(renderers.invoice.mock.calls[0][0]).toMatchObject({
      finalizedAt: '2026-10-01T03:00:00Z',
      proofUploadedAt: null,
    });
  });

  it('passes no acknowledge or payment moment it does not have', async () => {
    const { renderers, service } = setup(row({ status: 'creator_acked', acknowledged_at: null, paid_at: null }));

    await service.forContract(CONTRACT, {}, 'invoice');

    expect(renderers.invoice.mock.calls[0][0]).toMatchObject({ acknowledgedAt: null, paidAt: null });
  });

  it('says so when the PDF could not be made (AC 5)', async () => {
    const { renderers, service } = setup();
    renderers.invoice.mockRejectedValue(new Error('font'));

    await expect(service.forContract(CONTRACT, {}, 'invoice')).rejects.toThrow('PDF gagal dibuat. Coba lagi.');
  });
});
