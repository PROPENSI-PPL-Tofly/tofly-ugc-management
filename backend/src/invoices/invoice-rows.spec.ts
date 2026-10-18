import { Prisma } from '@prisma/client';
import { FORMULA, TODAY, day } from './invoice-test-data.js';
import {
  creatorName,
  pickContract,
  toInvoiceContract,
  toInvoiceItem,
  type InvoiceContentRow,
  type InvoiceContractRow,
  type InvoiceCreatorRow,
} from './invoice-rows.js';

function contentRow(
  overrides: Partial<InvoiceContentRow> = {},
): InvoiceContentRow {
  return {
    id: 'content-1',
    contract_id: 'contract-1',
    name: 'Evg_1_RanggaPratama',
    type: 'evergreen',
    status: 'scheduled',
    deadline: day(10),
    video_submitted_at: null,
    platform: null,
    views: null,
    likes: null,
    ...overrides,
  };
}

function contractRow(
  overrides: Partial<InvoiceContractRow> = {},
): InvoiceContractRow {
  return {
    id: 'contract-1',
    start_date: day(-60),
    end_date: day(60),
    content_quota: 11,
    fixed_rate: new Prisma.Decimal('5500000'),
    ...overrides,
  };
}

function creatorRow(
  overrides: Partial<InvoiceCreatorRow> = {},
): InvoiceCreatorRow {
  return {
    id: 'creator-1',
    first_name: 'Rangga',
    middle_name: null,
    last_name: 'Pratama',
    access_revoke_date: null,
    contracts: [contractRow()],
    ...overrides,
  };
}

describe('creatorName', () => {
  it('joins the name parts that are set', () => {
    expect(
      creatorName({
        first_name: 'Muhammad',
        middle_name: 'Farhan',
        last_name: null,
      }),
    ).toBe('Muhammad Farhan');
  });
});

describe('toInvoiceContract', () => {
  it('reads the numeric fixed rate as rupiah and the revocation as the early end', () => {
    expect(toInvoiceContract(contractRow(), day(-3))).toEqual({
      id: 'contract-1',
      startDate: day(-60),
      endDate: day(60),
      fixedRate: 5_500_000,
      contentQuota: 11,
      endedEarlyOn: day(-3),
    });
  });
});

describe('pickContract', () => {
  it('picks the running contract, not an earlier one', () => {
    const row = creatorRow({
      contracts: [
        contractRow({ id: 'old', start_date: day(-200), end_date: day(-61) }),
        contractRow({ id: 'running' }),
      ],
    });

    expect(pickContract(row, TODAY)?.id).toBe('running');
  });

  it('has nothing to invoice for a creator without a contract', () => {
    expect(pickContract(creatorRow({ contracts: [] }), TODAY)).toBeNull();
  });
});

describe('toInvoiceItem', () => {
  it('turns a creator row into the table item with every component and the total', () => {
    const item = toInvoiceItem(
      creatorRow(),
      contractRow(),
      [
        contentRow({
          id: 'late',
          status: 'link_submitted',
          deadline: day(-10),
          video_submitted_at: day(-8),
        }),
      ],
      FORMULA,
      TODAY,
    );

    expect(item).toMatchObject({
      creatorId: 'creator-1',
      creatorName: 'Rangga Pratama',
      contract: {
        id: 'contract-1',
        status: 'active',
        startDate: '2026-07-20',
        endDate: '2026-11-17',
      },
      rawTotal: 5_470_000,
      total: 5_470_000,
      floored: false,
    });
    expect(item.components.penalty.lines[0]).toMatchObject({
      contentId: 'late',
      amount: 30_000,
    });
    expect(item.components.performanceBonus.status).toBe('waiting_for_data');
  });

  it('marks a contract that has not started as upcoming, with no fixed rate earned yet', () => {
    const upcoming = contractRow({ start_date: day(5), end_date: day(100) });
    const item = toInvoiceItem(
      creatorRow({ contracts: [upcoming] }),
      upcoming,
      [],
      FORMULA,
      TODAY,
    );

    expect(item.contract.status).toBe('upcoming');
    expect(item.components.fixedRate.amount).toBe(0);
  });

  it('stops counting a never-delivered item at the day access was revoked', () => {
    const item = toInvoiceItem(
      creatorRow({ access_revoke_date: day(-11) }),
      contractRow(),
      [contentRow({ deadline: day(-12) })],
      FORMULA,
      TODAY,
    );

    expect(item.components.penalty.lines[0].basis.daysLate).toBe(1);
  });

  it('pays the fixed rate and waits on the rest while no formula is saved', () => {
    const item = toInvoiceItem(
      creatorRow(),
      contractRow(),
      [contentRow({ deadline: day(-5) })],
      null,
      TODAY,
    );

    expect(item.components.fixedRate.status).toBe('calculated');
    expect(item.components.penalty).toMatchObject({
      amount: null,
      status: 'waiting_for_data',
    });
    expect(item.total).toBe(item.components.fixedRate.amount);
  });

  // OWASP Top 10:2025 A08 (Software and Data Integrity Failures): adjustment sums stay exact to the sen.
  it('adds two-decimal adjustments to the total without floating-point drift', () => {
    const unpaid = contractRow({ fixed_rate: new Prisma.Decimal('0') });
    const adjustment = {
      reason: 'Koreksi',
      actorId: 'admin-1',
      createdAt: '2026-09-17T00:00:00.000Z',
    };
    const item = toInvoiceItem(
      creatorRow({ contracts: [unpaid] }),
      unpaid,
      [],
      FORMULA,
      TODAY,
      {
        status: 'running',
        adjustments: [
          { ...adjustment, id: 'adj-1', amount: 0.7 },
          { ...adjustment, id: 'adj-2', amount: 0.1 },
        ],
        snapshot: null,
      },
    );

    expect(item.components.fixedRate.amount).toBe(0);
    expect(item).toMatchObject({ rawTotal: 0.8, total: 0.8, floored: false });
  });
});
