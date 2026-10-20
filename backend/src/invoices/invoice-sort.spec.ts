import { BadRequestException } from '@nestjs/common';
import type { InvoiceListItem } from './dto/invoice-list.dto.js';
import {
  checkInvoiceSort,
  DEFAULT_INVOICE_SORT,
  sortInvoices,
} from './invoice-sort.js';

/** An item with only what sorting reads; the rest of the invoice does not matter here. */
function item(
  creatorName: string,
  status: 'active' | 'upcoming' | 'expired',
  amounts: { fixed?: number | null; penalty?: number | null; total?: number } = {},
  contract: { id?: string; startDate?: string } = {},
): InvoiceListItem {
  const component = (amount: number | null) => ({
    amount,
    status: 'calculated' as const,
    lines: [],
  });
  return {
    creatorId: creatorName,
    creatorName,
    contract: {
      id: contract.id ?? `${creatorName}-c`,
      status,
      startDate: contract.startDate ?? '',
      endDate: '',
      lastDay: '',
      period: 1,
    },
    components: {
      fixedRate: component(amounts.fixed === undefined ? 0 : amounts.fixed),
      additionalContent: component(0),
      performanceBonus: component(null),
      penalty: component(amounts.penalty === undefined ? 0 : amounts.penalty),
    },
    rawTotal: amounts.total ?? 0,
    total: amounts.total ?? 0,
    floored: false,
    invoiceStatus: 'accruing',
    adjustments: [],
    snapshot: null,
  };
}

const names = (items: InvoiceListItem[]) => items.map((i) => i.creatorName);

describe('checkInvoiceSort', () => {
  it('sorts by what needs action first when nothing is asked', () => {
    expect(checkInvoiceSort(undefined, undefined)).toEqual(DEFAULT_INVOICE_SORT);
    expect(DEFAULT_INVOICE_SORT).toEqual({ key: 'action', order: 'asc' });
  });

  it.each(['action', 'name', 'fixed', 'penalty', 'total'])(
    'reads the sort key %s, ascending unless told otherwise',
    (key) => {
      expect(checkInvoiceSort(key, undefined)).toEqual({ key, order: 'asc' });
      expect(checkInvoiceSort(key, 'desc')).toEqual({ key, order: 'desc' });
    },
  );

  it.each([['bonus'], ['NAME'], [''], ['__proto__'], [['name', 'total']]])(
    'rejects the sort key %j, naming the ones it takes',
    (key) => {
      expect(() => checkInvoiceSort(key, undefined)).toThrow(
        'sort must be one of action, name, fixed, penalty, total',
      );
    },
  );

  it.each([['up'], ['ASC'], [''], [['asc', 'desc']]])(
    'rejects the order %j',
    (order) => {
      expect(() => checkInvoiceSort('name', order)).toThrow(BadRequestException);
      expect(() => checkInvoiceSort('name', order)).toThrow(
        'order must be asc or desc',
      );
    },
  );
});

describe('sortInvoices', () => {
  const roster = [
    item('Yusuf', 'expired', { fixed: 400_000, penalty: 0, total: 400_000 }),
    item('Bagas', 'active', { fixed: 450_000, penalty: 150_000, total: 300_000 }),
    item('Farah', 'upcoming', { fixed: 0, penalty: null, total: 0 }),
    item('Adit', 'expired', { fixed: 400_000, penalty: 300_000, total: 100_000 }),
    item('Rangga', 'active', { fixed: 500_000, penalty: 150_000, total: 550_000 }),
  ];

  it('puts ended contracts first (ready to finalize), then running, then not started, by name within each', () => {
    expect(names(sortInvoices(roster, { key: 'action', order: 'asc' }))).toEqual([
      'Adit',
      'Yusuf',
      'Bagas',
      'Rangga',
      'Farah',
    ]);
  });

  it('turns the groups around when asked in reverse, keeping names in order within each', () => {
    expect(names(sortInvoices(roster, { key: 'action', order: 'desc' }))).toEqual([
      'Farah',
      'Bagas',
      'Rangga',
      'Adit',
      'Yusuf',
    ]);
  });

  it('sorts by name either way', () => {
    expect(names(sortInvoices(roster, { key: 'name', order: 'asc' }))).toEqual([
      'Adit',
      'Bagas',
      'Farah',
      'Rangga',
      'Yusuf',
    ]);
    expect(names(sortInvoices(roster, { key: 'name', order: 'desc' }))[0]).toBe('Yusuf');
  });

  it('sorts by the total, ties by name', () => {
    expect(names(sortInvoices(roster, { key: 'total', order: 'desc' }))).toEqual([
      'Rangga',
      'Yusuf',
      'Bagas',
      'Adit',
      'Farah',
    ]);
  });

  it('sorts by the penalty, reading one still waiting for a formula as none, ties by name', () => {
    expect(names(sortInvoices(roster, { key: 'penalty', order: 'desc' }))).toEqual([
      'Adit',
      'Bagas',
      'Rangga',
      'Farah',
      'Yusuf',
    ]);
  });

  it('sorts by the fixed rate ascending, ties by name', () => {
    expect(names(sortInvoices(roster, { key: 'fixed', order: 'asc' }))).toEqual([
      'Farah',
      'Adit',
      'Yusuf',
      'Bagas',
      'Rangga',
    ]);
  });

  // Two rows of one renewed creator tie on the name: the earlier contract comes first, then the
  // id, so paging the same list never shows a row twice or skips one.
  it.each([
    ['action', 'asc'],
    ['name', 'asc'],
    ['name', 'desc'],
    ['total', 'desc'],
  ] as const)('breaks a tie between two rows of one creator by the earlier contract (%s %s)', (key, order) => {
    const renewed = [
      item('Salsa', 'expired', { total: 100 }, { id: 'b-new', startDate: '2026-09-19' }),
      item('Salsa', 'expired', { total: 100 }, { id: 'a-old', startDate: '2025-09-14' }),
      item('Salsa', 'expired', { total: 100 }, { id: 'c-same', startDate: '2025-09-14' }),
    ];

    expect(sortInvoices(renewed, { key, order }).map((i) => i.contract.id)).toEqual([
      'a-old',
      'c-same',
      'b-new',
    ]);
  });

  it('leaves the list it was given as it was', () => {
    const before = names(roster);
    sortInvoices(roster, { key: 'name', order: 'desc' });

    expect(names(roster)).toEqual(before);
  });

  it('sorts a fixed rate with no amount yet as zero', () => {
    // Waiting on either side of a comparison, so both are read as zero.
    const waiting = [
      item('Kevin', 'upcoming', { fixed: null }),
      item('Bagas', 'active', { fixed: 450_000 }),
      item('Farah', 'upcoming', { fixed: null }),
    ];

    expect(names(sortInvoices(waiting, { key: 'fixed', order: 'asc' }))).toEqual(['Farah', 'Kevin', 'Bagas']);
    expect(names(sortInvoices(waiting, { key: 'fixed', order: 'desc' }))).toEqual(['Bagas', 'Farah', 'Kevin']);
  });
});
