import PDFDocument from 'pdfkit';
import { jakartaDay, readableDay } from '../creators/evergreen.js';
import type {
  InvoiceComponentDto,
  InvoiceSnapshotDto,
} from './dto/invoice-list.dto.js';
import {
  CREATOR_BANK_PLACEHOLDER,
  CREATOR_TAX_ID_PLACEHOLDER,
  TOFLY_ISSUER,
  WITHHOLDING_PLACEHOLDER,
} from './invoice-placeholders.js';
import type { InvoiceStatus } from './invoice-status.js';

// The invoice and its receipt as PDFs (PBI-31, 31.1). The *PdfModel functions turn a frozen
// invoice into the text a page shows, pure and tested without a PDF; the render* functions lay
// that text on A4 portrait pages. Every amount is read from the snapshot, so a file always says
// what the screen says (AC 3).
//
// The layout follows Stripe's invoice and receipt, the ones Claude sends: a title, who pays whom,
// one amount up top, a two-column table, subtotal and total on the right, and a footer on every
// page naming the document. Tofly pays the creator, so the parties read "Dari" and "Dibayarkan
// kepada", never "Bill to". The invoice exists once the creator acknowledged it, when nothing
// can change it any more; the receipt once the creator confirmed the payment arrived.

/** The statuses a PDF may be asked for; which document each allows is the service's rule. */
export type PdfInvoiceStatus = Exclude<InvoiceStatus, 'accruing'>;

export interface InvoicePdfData {
  invoiceNumber: string;
  /** TOF-RCP-YYYYMM-NNN once the payment was confirmed; null before. */
  receiptNumber: string | null;
  creatorName: string;
  creatorEmail: string;
  periodNumber: number;
  /** YYYY-MM-DD */
  periodStart: string;
  /** YYYY-MM-DD */
  periodEnd: string;
  status: PdfInvoiceStatus;
  /** ISO instants; null for a step not reached yet. */
  finalizedAt: string | null;
  acknowledgedAt: string | null;
  proofUploadedAt: string | null;
  paidAt: string | null;
  snapshot: InvoiceSnapshotDto;
}

export interface PdfLine {
  name: string;
  detail: string | null;
  amount: string;
}

export interface PdfComponent {
  label: string;
  amount: string;
  detail: string | null;
  lines: PdfLine[];
}

export interface PdfTotals {
  subtotal: string;
  adjustments: { reason: string; amount: string }[];
  /** Null when there is no adjustment. */
  adjustmentTotal: string | null;
  total: [string, string];
  /** The PPh 21 rows, placeholders until Tofly decides on withholding. */
  withholding: [string, string][];
}

export interface PdfDocumentModel {
  title: string;
  brand: string;
  meta: [string, string][];
  issuer: { heading: string; lines: string[] };
  payee: { heading: string; lines: string[] };
  headline: { amount: string; note: string | null };
  components: PdfComponent[];
  totals: PdfTotals;
  /** Empty on a receipt, which is one step of it. */
  history: [string, string][];
  /** The document's number, at the foot of every page. */
  footer: string;
}

const DASH = '-';

/** Kept to the sen, so the file never rounds away what the screen shows. */
const RUPIAH_DIGITS = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  useGrouping: true,
});

/**
 * Rupiah as the app writes it, Rp1.250.000, with an ASCII minus before a deduction: the PDF's
 * built-in font has no typographic minus sign.
 */
export function pdfRupiah(value: number): string {
  const text = `Rp${RUPIAH_DIGITS.format(Math.abs(value))}`;
  return value < 0 ? `-${text}` : text;
}

/** A sum of rupiah amounts, kept to the sen so 0,1 + 0,2 never prints a stray digit. */
function sum(values: readonly number[]): number {
  return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
}

function instantDay(instant: string | null): string {
  return instant === null ? DASH : readableDay(jakartaDay(new Date(instant)));
}

/** The four parts in the order the screen lists them; the penalty is the one that subtracts. */
const COMPONENTS = [
  { key: 'fixedRate', label: 'Fixed Rate', sign: 1 },
  { key: 'additionalContent', label: 'Biaya Konten Tambahan', sign: 1 },
  { key: 'performanceBonus', label: 'Bonus Performa', sign: 1 },
  { key: 'penalty', label: 'Penalti', sign: -1 },
] as const;

type ComponentKey = (typeof COMPONENTS)[number]['key'];

const PLATFORM_LABELS: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok' };
const METRIC_LABELS: Record<string, string> = {
  views: 'Views',
  likes: 'Likes',
  comments: 'Comments',
  shares: 'Shares',
};
const COUNT = new Intl.NumberFormat('id-ID');

type Basis = InvoiceComponentDto['lines'][number]['basis'];

function numberIn(basis: Basis, key: string): number | null {
  const value = basis[key];
  return typeof value === 'number' ? value : null;
}

/**
 * What a line was paid or charged for, worded as the screen's Rincian words it (the built-in
 * font has the × it needs). A penalty says only how late it was. Null when the snapshot does
 * not carry it.
 */
function lineDetail(key: ComponentKey, basis: Basis): string | null {
  if (key === 'additionalContent') {
    const fee = numberIn(basis, 'fee');
    return fee === null ? null : `1 konten × ${pdfRupiah(fee)}`;
  }
  if (key === 'performanceBonus') {
    const value = numberIn(basis, 'value');
    const tier = numberIn(basis, 'tier');
    const platform = PLATFORM_LABELS[String(basis.platform)];
    const metric = METRIC_LABELS[String(basis.metric)];
    if (value === null || tier === null || tier < 1 || !platform || !metric) return null;
    return `${platform} · ${COUNT.format(value)} ${metric} · Tier ${tier}`;
  }
  const late = numberIn(basis, 'daysLate');
  return key === 'penalty' && late !== null ? `Telat ${late} hari` : null;
}

function amountOf(component: InvoiceComponentDto): number {
  if (component.amount === null) {
    // A frozen invoice never waits for data; a snapshot that does is not one to print.
    throw new Error('Snapshot invoice tidak lengkap');
  }
  return component.amount;
}

function periodOf(data: InvoicePdfData): string {
  return `${readableDay(data.periodStart)} - ${readableDay(data.periodEnd)}`;
}

/** The parts with their signed amounts and every content's line, the same on both documents. */
function componentsOf(data: InvoicePdfData) {
  const { snapshot } = data;
  return COMPONENTS.map(({ key, label, sign }) => {
    const component = snapshot[key];
    const amount = sign * amountOf(component);
    const row: PdfComponent = {
      label,
      amount: pdfRupiah(amount),
      // The fixed rate is the contract itself: its period says it, not a line per content.
      detail: key === 'fixedRate' ? `Kontrak ${periodOf(data)}` : null,
      // A line worth nothing (a late Specific, a link with no data or below Tier 1) only
      // lengthens the page; the screen's Rincian keeps it (agreed 25 Nov 2026).
      lines:
        key === 'fixedRate'
          ? []
          : component.lines.filter((line) => line.amount !== 0).map((line) => ({
              name: line.contentName,
              detail: lineDetail(key, line.basis),
              amount: pdfRupiah(sign * line.amount),
            })),
    };
    return { amount, row };
  });
}

function issuer(): PdfDocumentModel['issuer'] {
  return {
    heading: 'Dari',
    lines: [TOFLY_ISSUER.name, ...TOFLY_ISSUER.address, `NPWP ${TOFLY_ISSUER.npwp}`, TOFLY_ISSUER.email],
  };
}

function payeeLines(data: InvoicePdfData): string[] {
  return [data.creatorName, data.creatorEmail, `NIK/NPWP ${CREATOR_TAX_ID_PLACEHOLDER}`];
}

function totalsOf(
  data: InvoicePdfData,
  parts: { amount: number }[],
  totalLabel: string,
): PdfTotals {
  const { snapshot } = data;
  const adjustmentAmounts = snapshot.adjustments.map((adjustment) => adjustment.amount);
  return {
    subtotal: pdfRupiah(sum(parts.map((part) => part.amount))),
    adjustments: snapshot.adjustments.map((adjustment) => ({
      reason: adjustment.reason,
      amount: pdfRupiah(adjustment.amount),
    })),
    adjustmentTotal: adjustmentAmounts.length > 0 ? pdfRupiah(sum(adjustmentAmounts)) : null,
    total: [totalLabel, pdfRupiah(snapshot.total)],
    withholding: [
      ['PPh 21 dipotong', WITHHOLDING_PLACEHOLDER],
      ['Jumlah diterima creator', WITHHOLDING_PLACEHOLDER],
    ],
  };
}

/** The invoice's pages (AC 2): every content line, issued the day the creator acknowledged it. */
export function invoicePdfModel(data: InvoicePdfData): PdfDocumentModel {
  const parts = componentsOf(data);
  return {
    title: 'Invoice',
    brand: 'Tofly',
    meta: [
      ['Nomor invoice', data.invoiceNumber],
      ['Tanggal terbit', instantDay(data.acknowledgedAt)],
      ['Periode', periodOf(data)],
    ],
    issuer: issuer(),
    payee: { heading: 'Dibayarkan kepada', lines: payeeLines(data) },
    headline: { amount: pdfRupiah(data.snapshot.total), note: null },
    components: parts.map((part) => part.row),
    totals: totalsOf(data, parts, 'Total'),
    history: [
      ['Difinalisasi', instantDay(data.finalizedAt)],
      ['Di-acknowledge', instantDay(data.acknowledgedAt)],
      ['Dibayar', instantDay(data.paidAt)],
    ],
    footer: data.invoiceNumber,
  };
}

/**
 * The receipt's pages: what was paid, when, how and against which invoice, with every content
 * line as Stripe's receipt repeats its invoice's items, so the receipt stands on its own.
 */
export function receiptPdfModel(data: InvoicePdfData): PdfDocumentModel {
  const parts = componentsOf(data);
  // The service asks for a receipt of a paid invoice only, which always has its number.
  const number = data.receiptNumber ?? DASH;
  const proof = data.proofUploadedAt === null ? '' : `, bukti diunggah ${instantDay(data.proofUploadedAt)}`;
  return {
    title: 'Receipt',
    brand: 'Tofly',
    meta: [
      ['Nomor receipt', number],
      ['Nomor invoice', data.invoiceNumber],
      ['Tanggal dibayar', instantDay(data.paidAt)],
      ['Metode pembayaran', `Transfer bank${proof}`],
    ],
    issuer: issuer(),
    payee: {
      heading: 'Dibayarkan kepada',
      lines: [...payeeLines(data), `Rekening ${CREATOR_BANK_PLACEHOLDER}`],
    },
    headline: {
      amount: pdfRupiah(data.snapshot.total),
      note: `Dibayar pada ${instantDay(data.paidAt)}`,
    },
    components: parts.map((part) => part.row),
    totals: totalsOf(data, parts, 'Total dibayar'),
    history: [],
    footer: number,
  };
}

/** The foot of one page: the document and which page out of all of them. */
export function pageFooter(footer: string, page: number, pages: number): string {
  return `${footer} · Halaman ${page} dari ${pages}`;
}

const MARGIN = 48;
const FOOTER_SPACE = 28;
const AMOUNT_WIDTH = 150;
const INDENT = 14;
const INK = '#111827';
const MUTED = '#5b6473';
const RULE = '#d1d5db';

type Doc = InstanceType<typeof PDFDocument>;

function contentWidth(doc: Doc): number {
  return doc.page.width - MARGIN * 2;
}

/** Starts a new page when fewer than `needed` points are left above the footer. */
function room(doc: Doc, needed: number): void {
  if (doc.y > doc.page.height - MARGIN - FOOTER_SPACE - needed) {
    doc.addPage();
  }
}

/** A label on the left and an amount on the right of one line. */
function row(
  doc: Doc,
  left: string,
  right: string,
  options: { indent?: number; bold?: boolean; muted?: boolean; size?: number; from?: number } = {},
): void {
  room(doc, 16);
  const width = contentWidth(doc);
  const indent = options.indent ?? 0;
  const from = options.from ?? MARGIN;
  const y = doc.y;
  doc
    .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(options.size ?? 10)
    .fillColor(options.muted ? MUTED : INK);
  doc.text(left, from + indent, y, { width: MARGIN + width - AMOUNT_WIDTH - from - indent - 8 });
  const afterLeft = doc.y;
  doc.text(right, MARGIN + width - AMOUNT_WIDTH, y, { width: AMOUNT_WIDTH, align: 'right' });
  doc.fontSize(10);
  doc.x = MARGIN;
  doc.y = Math.max(afterLeft, doc.y) + 3;
}

/** A line's detail, small and muted under its name, kept clear of the amount column. */
function detailLine(doc: Doc, text: string, indent: number): void {
  room(doc, 12);
  doc.y -= 1;
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(text, MARGIN + indent, doc.y, { width: contentWidth(doc) - AMOUNT_WIDTH - indent - 8 });
  doc.fontSize(10);
  doc.x = MARGIN;
  doc.y += 4;
}

function rule(doc: Doc, from = MARGIN): void {
  const y = doc.y + 2;
  doc
    .moveTo(from, y)
    .lineTo(doc.page.width - MARGIN, y)
    .lineWidth(0.5)
    .strokeColor(RULE)
    .stroke();
  doc.y = y + 7;
}

function header(doc: Doc, model: PdfDocumentModel): void {
  const width = contentWidth(doc);
  doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text(model.title, MARGIN, MARGIN);
  doc.fontSize(16).text(model.brand, MARGIN, MARGIN + 4, { width, align: 'right' });
  doc.y = MARGIN + 40;

  for (const [name, value] of model.meta) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(name, MARGIN, y, { width: 110 });
    doc.fillColor(INK).text(value, MARGIN + 118, y, { width: width - 118 });
    doc.y += 2;
  }

  // The two parties side by side, each as tall as it needs.
  doc.y += 14;
  const top = doc.y;
  const half = (width - 24) / 2;
  let bottom = top;
  for (const [index, party] of [model.issuer, model.payee].entries()) {
    const x = MARGIN + index * (half + 24);
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(party.heading, x, top, { width: half });
    doc.y += 2;
    party.lines.forEach((text, line) => {
      doc
        .font(line === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(10)
        .fillColor(INK)
        .text(text, x, doc.y, { width: half });
    });
    bottom = Math.max(bottom, doc.y);
  }
  doc.x = MARGIN;
  doc.y = bottom + 18;

  doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(model.headline.amount, MARGIN);
  if (model.headline.note) {
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(model.headline.note, MARGIN);
  }
  doc.y += 18;
}

function table(doc: Doc, model: PdfDocumentModel): void {
  row(doc, 'Deskripsi', 'Jumlah', { muted: true, size: 8.5 });
  rule(doc);

  for (const component of model.components) {
    row(doc, component.label, component.amount, { bold: true });
    if (component.detail) {
      detailLine(doc, component.detail, 0);
    }
    for (const line of component.lines) {
      row(doc, line.name, line.amount, { indent: INDENT });
      if (line.detail) {
        detailLine(doc, line.detail, INDENT);
      }
    }
    doc.y += 3;
  }
  rule(doc);
}

/** Subtotal, the adjustments, the total and the tax rows, in the right half, as Stripe sums. */
function totals(doc: Doc, model: PdfDocumentModel): void {
  const from = MARGIN + contentWidth(doc) / 2 - 60;
  const { totals: sums } = model;
  room(doc, 80);
  row(doc, 'Subtotal', sums.subtotal, { from });
  if (sums.adjustmentTotal !== null) {
    row(doc, 'Penyesuaian', sums.adjustmentTotal, { from });
    for (const adjustment of sums.adjustments) {
      row(doc, adjustment.reason, adjustment.amount, { from, indent: INDENT, muted: true, size: 9 });
    }
  }
  rule(doc, from);
  row(doc, sums.total[0], sums.total[1], { from, bold: true, size: 12 });
  for (const [name, value] of sums.withholding) {
    row(doc, name, value, { from, muted: true, size: 9 });
  }
  doc.x = MARGIN;
}

function history(doc: Doc, model: PdfDocumentModel): void {
  if (model.history.length === 0) return;
  doc.y += 18;
  room(doc, 60);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Riwayat status', MARGIN);
  doc.y += 4;
  for (const [step, day] of model.history) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(step, MARGIN, y, { width: 110 });
    doc.fillColor(INK).text(day, MARGIN + 118, y);
    doc.y += 1;
  }
}

/** Writes each page's footer once every page exists, so it can say how many there are. */
function footers(doc: Doc, model: PdfDocumentModel): void {
  const { start, count } = doc.bufferedPageRange();
  for (let index = start; index < start + count; index += 1) {
    doc.switchToPage(index);
    // Below the bottom margin: lift it for the footer, or pdfkit would start another page.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(pageFooter(model.footer, index - start + 1, count), MARGIN, doc.page.height - MARGIN + 12, {
        width: contentWidth(doc),
        lineBreak: false,
      });
    doc.page.margins.bottom = bottom;
  }
}

function render(model: PdfDocumentModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margin: MARGIN,
      bufferPages: true,
      info: { Title: `${model.title} ${model.footer}`, Author: model.brand },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, model);
    table(doc, model);
    totals(doc, model);
    history(doc, model);
    footers(doc, model);

    doc.end();
  });
}

/** The invoice on A4 portrait pages, as a PDF file's bytes (AC 3). */
export function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return render(invoicePdfModel(data));
}

/** The receipt on A4 portrait pages, as a PDF file's bytes. */
export function renderReceiptPdf(data: InvoicePdfData): Promise<Buffer> {
  return render(receiptPdfModel(data));
}
