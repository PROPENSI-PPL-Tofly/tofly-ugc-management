import type { InvoiceSnapshotDto } from './dto/invoice-list.dto.js';
import {
  invoicePdfModel,
  pageFooter,
  pdfRupiah,
  receiptPdfModel,
  renderInvoicePdf,
  renderReceiptPdf,
  type InvoicePdfData,
} from './invoice-pdf.js';
import {
  CREATOR_BANK_PLACEHOLDER,
  CREATOR_TAX_ID_PLACEHOLDER,
  TOFLY_ISSUER,
  WITHHOLDING_PLACEHOLDER,
} from './invoice-placeholders.js';

function line(name: string, amount: number, basis: Record<string, number | string | null> = {}) {
  return { contentId: name, contentName: name, amount, basis };
}

const SNAPSHOT: InvoiceSnapshotDto = {
  fixedRate: { amount: 1_250_000, status: 'calculated', lines: [line('Kontrak', 1_250_000)] },
  additionalContent: {
    amount: 300_000,
    status: 'calculated',
    lines: [line('Spc_1_Rangga', 300_000, { fee: 300_000 }), line('Spc_2_Rangga', 0, { fee: 300_000, late: 'yes' })],
  },
  performanceBonus: {
    amount: 150_000,
    status: 'calculated',
    lines: [
      line('Evg_1_Rangga', 100_000, { platform: 'instagram', metric: 'views', value: 128_400, tier: 3 }),
      line('Evg_2_Rangga', 50_000, { platform: 'tiktok', metric: 'likes', value: 900, tier: 1 }),
    ],
  },
  penalty: {
    amount: 75_000,
    status: 'calculated',
    lines: [line('Evg_3_Rangga', 75_000, { daysLate: 5, chargedDays: 3, perDay: 25_000, handedIn: 'no' })],
  },
  adjustments: [
    {
      id: 'adj-1',
      amount: -25_000,
      reason: 'Koreksi bonus',
      actorId: 'admin-1',
      createdAt: '2026-10-02T03:00:00Z',
    },
  ],
  rawTotal: 1_600_000,
  total: 1_600_000,
  floored: false,
  finalizedAt: '2026-10-01T03:00:00Z',
};

const DATA: InvoicePdfData = {
  invoiceNumber: 'TOF-INV-202610-001',
  // Numbered in the month the payment was confirmed, by its own counter.
  receiptNumber: 'TOF-RCP-202610-004',
  creatorName: 'Rangga Pratama',
  creatorEmail: 'rangga@example.com',
  periodNumber: 2,
  periodStart: '2026-06-01',
  periodEnd: '2026-09-30',
  status: 'paid',
  finalizedAt: '2026-10-01T03:00:00Z',
  acknowledgedAt: '2026-10-02T03:00:00Z',
  proofUploadedAt: '2026-10-04T03:00:00Z',
  // 17:30 UTC on 4 Oct is already 5 Oct in Jakarta.
  paidAt: '2026-10-04T17:30:00Z',
  snapshot: SNAPSHOT,
};

describe('pdfRupiah', () => {
  it.each([
    [1_250_000, 'Rp1.250.000'],
    [0, 'Rp0'],
    // Kept to the sen so the file never rounds away what the screen shows.
    [1_024_999.5, 'Rp1.024.999,5'],
    [-25_000, '-Rp25.000'],
  ])('writes %d as %s', (value, text) => {
    expect(pdfRupiah(value)).toBe(text);
  });
});

// Benchmarked on Stripe's invoice, the one Claude sends: a title, who pays whom, one amount up
// top, a two-column table, subtotal and total on the right, a footer per page.
describe('invoicePdfModel (AC 2)', () => {
  const model = invoicePdfModel(DATA);

  it('heads the page as an invoice from Tofly, issued the day the creator acknowledged it', () => {
    expect(model.title).toBe('Invoice');
    expect(model.brand).toBe('Tofly');
    expect(model.meta).toEqual([
      ['Nomor invoice', 'TOF-INV-202610-001'],
      ['Tanggal terbit', '2 Okt 2026'],
      ['Periode', '1 Jun 2026 - 30 Sep 2026'],
    ]);
  });

  it("names Tofly's legal identity and the creator's tax id, placeholders until Tofly provides them", () => {
    expect(model.issuer).toEqual({
      heading: 'Dari',
      lines: [TOFLY_ISSUER.name, ...TOFLY_ISSUER.address, `NPWP ${TOFLY_ISSUER.npwp}`, TOFLY_ISSUER.email],
    });
    expect(model.payee).toEqual({
      heading: 'Dibayarkan kepada',
      lines: ['Rangga Pratama', 'rangga@example.com', `NIK/NPWP ${CREATOR_TAX_ID_PLACEHOLDER}`],
    });
  });

  it('puts the total up top on its own', () => {
    expect(model.headline).toEqual({ amount: 'Rp1.600.000', note: null });
  });

  it('lists one row per component, each content with what it was paid or charged for', () => {
    expect(model.components).toEqual([
      { label: 'Fixed Rate', amount: 'Rp1.250.000', detail: 'Kontrak 1 Jun 2026 - 30 Sep 2026', lines: [] },
      {
        label: 'Biaya Konten Tambahan',
        amount: 'Rp300.000',
        detail: null,
        // Spc_2 came in late and earned nothing, so it is not listed.
        lines: [{ name: 'Spc_1_Rangga', detail: '1 konten × Rp300.000', amount: 'Rp300.000' }],
      },
      {
        label: 'Bonus Performa',
        amount: 'Rp150.000',
        detail: null,
        lines: [
          { name: 'Evg_1_Rangga', detail: 'Instagram · 128.400 Views · Tier 3', amount: 'Rp100.000' },
          { name: 'Evg_2_Rangga', detail: 'TikTok · 900 Likes · Tier 1', amount: 'Rp50.000' },
        ],
      },
      {
        label: 'Penalti',
        amount: '-Rp75.000',
        detail: null,
        // The days late only: the cap and whether it was handed in stay on the screen.
        lines: [{ name: 'Evg_3_Rangga', detail: 'Telat 5 hari', amount: '-Rp75.000' }],
      },
    ]);
  });

  it('leaves out a detail the snapshot does not carry, as one saved before it did', () => {
    const snapshot = {
      ...SNAPSHOT,
      performanceBonus: { amount: 5_000, status: 'calculated' as const, lines: [line('Old', 5_000)] },
    };

    expect(invoicePdfModel({ ...DATA, snapshot }).components[2].lines).toEqual([
      { name: 'Old', detail: null, amount: 'Rp5.000' },
    ]);
  });

  // Agreed 25 Nov 2026: a line worth nothing (a late Specific, a link with no data or below
  // Tier 1) only lengthens the page; the screen keeps it.
  it('leaves out every content line that earned nothing', () => {
    const snapshot = {
      ...SNAPSHOT,
      performanceBonus: {
        amount: 100_000,
        status: 'calculated' as const,
        lines: [
          line('Paid', 100_000, { platform: 'instagram', metric: 'views', value: 20_000, tier: 1 }),
          line('NoData', 0, { platform: 'tiktok', metric: 'likes', value: null, tier: 0 }),
        ],
      },
    };

    expect(invoicePdfModel({ ...DATA, snapshot }).components[2].lines.map((l) => l.name)).toEqual(['Paid']);
  });

  it('sums the parts, the adjustments with their reasons, the total, then the tax rows to settle', () => {
    expect(model.totals).toEqual({
      subtotal: 'Rp1.625.000',
      adjustments: [{ reason: 'Koreksi bonus', amount: '-Rp25.000' }],
      adjustmentTotal: '-Rp25.000',
      total: ['Total', 'Rp1.600.000'],
      withholding: [
        ['PPh 21 dipotong', WITHHOLDING_PLACEHOLDER],
        ['Jumlah diterima creator', WITHHOLDING_PLACEHOLDER],
      ],
    });
  });

  it('shows no adjustments row when there are none', () => {
    const plain = invoicePdfModel({ ...DATA, snapshot: { ...SNAPSHOT, adjustments: [] } });

    expect(plain.totals.adjustments).toEqual([]);
    expect(plain.totals.adjustmentTotal).toBeNull();
  });

  it('prints a total held at zero as Rp0, without a note', () => {
    const floored = invoicePdfModel({ ...DATA, snapshot: { ...SNAPSHOT, total: 0, floored: true } });

    expect(floored.totals.total).toEqual(['Total', 'Rp0']);
  });

  it('labels a bonus frozen before all its data came in as it labels any bonus', () => {
    const pending = invoicePdfModel({ ...DATA, snapshot: { ...SNAPSHOT, performanceBonusPending: true } });

    expect(pending.components[2].label).toBe('Bonus Performa');
  });

  it('keeps the status history, a dash for a step not reached yet', () => {
    expect(model.history).toEqual([
      ['Difinalisasi', '1 Okt 2026'],
      ['Di-acknowledge', '2 Okt 2026'],
      ['Dibayar', '5 Okt 2026'],
    ]);
    expect(invoicePdfModel({ ...DATA, status: 'creator_acked', paidAt: null }).history).toContainEqual([
      'Dibayar',
      '-',
    ]);
  });

  it('names only the invoice in the footer of every page', () => {
    expect(model.footer).toBe('TOF-INV-202610-001');
  });

  // OWASP Top 10:2025 A10: a frozen invoice always has its amounts; one that does not is refused.
  it('refuses a snapshot with a component still waiting for data', () => {
    const waiting = { ...SNAPSHOT, penalty: { amount: null, status: 'waiting_for_data' as const, lines: [] } };

    expect(() => invoicePdfModel({ ...DATA, snapshot: waiting })).toThrow('Snapshot invoice tidak lengkap');
  });
});

// Stripe's receipt: what was paid, when, how, and against which invoice, with every line.
describe('receiptPdfModel', () => {
  const model = receiptPdfModel(DATA);

  it('heads the page as a receipt for the invoice, with the day it was paid and how', () => {
    expect(model.title).toBe('Receipt');
    expect(model.meta).toEqual([
      ['Nomor receipt', 'TOF-RCP-202610-004'],
      ['Nomor invoice', 'TOF-INV-202610-001'],
      ['Tanggal dibayar', '5 Okt 2026'],
      ['Metode pembayaran', 'Transfer bank, bukti diunggah 4 Okt 2026'],
    ]);
  });

  it('names the account the money went to, a placeholder until the app keeps it', () => {
    expect(model.payee.lines).toEqual([
      'Rangga Pratama',
      'rangga@example.com',
      `NIK/NPWP ${CREATOR_TAX_ID_PLACEHOLDER}`,
      `Rekening ${CREATOR_BANK_PLACEHOLDER}`,
    ]);
  });

  it('puts what was paid up top, with the day', () => {
    expect(model.headline).toEqual({ amount: 'Rp1.600.000', note: 'Dibayar pada 5 Okt 2026' });
  });

  // Agreed 25 Nov 2026: every content line, as Stripe's receipt repeats its invoice's items, so
  // the receipt stands on its own.
  it("lists every part with its content lines, the same as the invoice's", () => {
    expect(model.components).toEqual(invoicePdfModel(DATA).components);
  });

  it('closes with what was paid, no history, and the receipt in the footer', () => {
    expect(model.totals.total).toEqual(['Total dibayar', 'Rp1.600.000']);
    expect(model.history).toEqual([]);
    expect(model.footer).toBe('TOF-RCP-202610-004');
  });

  it('writes a dash for a proof day it does not have', () => {
    expect(receiptPdfModel({ ...DATA, proofUploadedAt: null }).meta).toContainEqual([
      'Metode pembayaran',
      'Transfer bank',
    ]);
  });
});

describe('pageFooter', () => {
  it('names the document and the page out of all of them', () => {
    expect(pageFooter('TOF-INV-202610-001', 2, 3)).toBe('TOF-INV-202610-001 · Halaman 2 dari 3');
  });
});

describe('rendering (AC 3)', () => {
  it.each([
    ['invoice', renderInvoicePdf],
    ['receipt', renderReceiptPdf],
  ] as const)('renders the %s as an A4 portrait PDF', async (_name, render) => {
    const pdf = await render(DATA);

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // A4 is 595.28 x 841.89 points, width before height for portrait.
    expect(pdf.toString('latin1')).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
  });

  it('flows onto more pages when the lines do not fit one', async () => {
    const many = Array.from({ length: 120 }, (_, i) => line(`Evg_${i}_Rangga`, 1_000));
    const pdf = await renderInvoicePdf({
      ...DATA,
      snapshot: { ...SNAPSHOT, performanceBonus: { amount: 120_000, status: 'calculated', lines: many } },
    });

    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(1);
  });
});
