import type { InvoiceListItem } from './dto/invoice-list.dto.js';
import { csvCell, toInvoiceCsv } from './invoice-csv.js';

function item(overrides: Partial<InvoiceListItem> = {}): InvoiceListItem {
  const component = (amount: number | null, status: 'calculated' | 'waiting_for_data' = 'calculated') => ({
    amount,
    status,
    lines: [],
  });
  return {
    creatorId: 'c-1',
    creatorName: 'Rangga Pratama',
    contract: { id: 'k-1', status: 'active', startDate: '2026-09-01', endDate: '2026-11-30' },
    components: {
      fixedRate: component(500_000),
      additionalContent: component(200_000),
      performanceBonus: component(null, 'waiting_for_data'),
      penalty: component(150_000),
    },
    rawTotal: 550_000,
    total: 550_000,
    floored: false,
    invoiceStatus: 'accruing',
    ...overrides,
  };
}

/** The rows of a CSV without its byte order mark, each split into its cells. */
function rows(csv: string): string[] {
  return csv.replace(/^﻿/, '').split('\r\n');
}

describe('toInvoiceCsv', () => {
  it('starts with a byte order mark, so a spreadsheet reads it as UTF-8', () => {
    expect(toInvoiceCsv([]).startsWith('﻿')).toBe(true);
  });

  it('heads the columns as the table does, with a note column', () => {
    expect(rows(toInvoiceCsv([]))[0]).toBe(
      'Creator,Kontrak,Fixed Rate,Fee Konten Tambahan,Bonus Performa,Penalti,Total,Status Invoice,Catatan',
    );
  });

  it('writes one row per invoice, amounts as plain rupiah numbers and words as the app words them', () => {
    expect(rows(toInvoiceCsv([item()]))[1]).toBe(
      'Rangga Pratama,Aktif,500000,200000,Menunggu data,150000,550000,Berjalan,Bonus performa menunggu data',
    );
  });

  it('notes a total the penalty used up', () => {
    const floored = item({
      components: {
        ...item().components,
        performanceBonus: { amount: 0, status: 'calculated', lines: [] },
        penalty: { amount: 900_000, status: 'calculated', lines: [] },
      },
      rawTotal: -200_000,
      total: 0,
      floored: true,
    });

    expect(rows(toInvoiceCsv([floored]))[1]).toBe(
      'Rangga Pratama,Aktif,500000,200000,0,900000,0,Berjalan,Penalti melebihi pembayaran',
    );
  });

  it('writes a fee or penalty still waiting for a formula as an empty cell, not a zero', () => {
    const waiting = item({
      components: {
        fixedRate: { amount: 0, status: 'calculated', lines: [] },
        additionalContent: { amount: null, status: 'waiting_for_data', lines: [] },
        performanceBonus: { amount: null, status: 'waiting_for_data', lines: [] },
        penalty: { amount: null, status: 'waiting_for_data', lines: [] },
      },
      contract: { id: 'k', status: 'upcoming', startDate: '', endDate: '' },
      total: 0,
      rawTotal: 0,
    });

    expect(rows(toInvoiceCsv([waiting]))[1]).toBe(
      'Rangga Pratama,Belum Dimulai,0,,Menunggu data,,0,Berjalan,Bonus performa menunggu data',
    );
  });

  it('ends every row with CRLF, as RFC 4180 asks', () => {
    expect(toInvoiceCsv([item(), item()]).replace(/^﻿/, '').match(/\r\n/g)).toHaveLength(3);
  });
});

describe('csvCell', () => {
  it('leaves plain text as it is', () => {
    expect(csvCell('Rangga Pratama')).toBe('Rangga Pratama');
  });

  it('quotes a cell holding a comma, a quote or a line break, doubling the quotes', () => {
    expect(csvCell('Pratama, Rangga')).toBe('"Pratama, Rangga"');
    expect(csvCell('Rangga "RP" Pratama')).toBe('"Rangga ""RP"" Pratama"');
    expect(csvCell('Rangga\nPratama')).toBe('"Rangga\nPratama"');
  });

  // A spreadsheet runs a cell that starts like a formula; a creator's name is typed by people,
  // so it must never become one (CSV injection, OWASP A03).
  it.each([
    ['=HYPERLINK("http://evil.example","klik")', `"'=HYPERLINK(""http://evil.example"",""klik"")"`],
    ['+62812', "'+62812"],
    ['-1+1', "'-1+1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tcmd', "'\tcmd"],
    ['\rcmd', `"'\rcmd"`],
  ])('neutralises %j so a spreadsheet shows it as text', (raw, cell) => {
    expect(csvCell(raw)).toBe(cell);
  });

  it('writes numbers as they are, a negative one included, since numbers are not text a person typed', () => {
    expect(csvCell(550000)).toBe('550000');
    expect(csvCell(-200000)).toBe('-200000');
  });

  it('writes nothing for a missing value', () => {
    expect(csvCell(null)).toBe('');
  });
});
