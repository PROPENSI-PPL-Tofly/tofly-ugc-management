// The Rate & Invoicing table as a CSV file for finance: one row per invoice, the same columns and
// words as the table, amounts as plain rupiah numbers a spreadsheet can add up.

import type { InvoiceListItem } from './dto/invoice-list.dto.js';
import type { InvoiceStatus } from './invoice-status.js';

const HEADER = [
  'Creator',
  'Kontrak',
  'Fixed Rate',
  'Fee Konten Tambahan',
  'Bonus Performa',
  'Penalti',
  'Total',
  'Status Invoice',
  'Catatan',
];

const CONTRACT_LABELS: Record<InvoiceListItem['contract']['status'], string> = {
  active: 'Aktif',
  upcoming: 'Belum Dimulai',
  expired: 'Berakhir',
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  accruing: 'Berjalan',
  finalized: 'Invoice Terkirim',
  creator_acked: 'Perlu Bukti Bayar',
  payment_uploaded: 'Bukti Bayar Terkirim',
  paid: 'Paid',
};

/** A spreadsheet runs a cell that starts with one of these as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One cell. Text a person typed, such as a creator's name, is prefixed with an apostrophe when it
 * starts like a formula, so a spreadsheet shows it rather than runs it (CSV injection, OWASP A03).
 * A cell holding a comma, a quote or a line break is quoted, its quotes doubled (RFC 4180).
 * Numbers are the app's own and are written as they are.
 */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);

  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function notes(item: InvoiceListItem): string {
  const said: string[] = [];
  if (item.floored) said.push('Penalti melebihi pembayaran');
  if (item.components.performanceBonus.status === 'waiting_for_data') {
    said.push('Bonus performa menunggu data');
  }
  return said.join('; ');
}

function row(item: InvoiceListItem): string {
  const { fixedRate, additionalContent, performanceBonus, penalty } = item.components;
  const bonus =
    performanceBonus.status === 'waiting_for_data' ? 'Menunggu data' : performanceBonus.amount;

  return [
    item.creatorName,
    CONTRACT_LABELS[item.contract.status],
    fixedRate.amount,
    additionalContent.amount,
    bonus,
    penalty.amount,
    item.total,
    STATUS_LABELS[item.invoiceStatus],
    notes(item),
  ]
    .map(csvCell)
    .join(',');
}

/**
 * The invoices as a CSV file: a byte order mark so a spreadsheet reads it as UTF-8, a header row,
 * then a row per invoice, every row ended with CRLF.
 */
export function toInvoiceCsv(items: readonly InvoiceListItem[]): string {
  return `﻿${[HEADER.join(','), ...items.map(row)].map((line) => `${line}\r\n`).join('')}`;
}
