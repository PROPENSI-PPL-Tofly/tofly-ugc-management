import { Prisma } from '@prisma/client';
import { FORMULA, TODAY, day } from './invoice-test-data.js';
import {
  creatorName,
  toInvoiceContract,
  toInvoiceItem,
  type InvoiceCreatorRow,
} from './invoice-rows.js';

type ContractRow = InvoiceCreatorRow['contracts'][number];
type ContentRow = ContractRow['contents'][number];

function contentRow(overrides: Partial<ContentRow> = {}): ContentRow {
  return {
    id: 'content-1',
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

function contractRow(overrides: Partial<ContractRow> = {}): ContractRow {
  return {
    id: 'contract-1',
    start_date: day(-60),
    end_date: day(60),
    content_quota: 11,
    fixed_rate: new Prisma.Decimal('5500000'),
    contents: [],
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

describe('toInvoiceItem', () => {
  it('turns a creator row into the table item with every component and the total', () => {
    const item = toInvoiceItem(
      creatorRow({
        contracts: [
          contractRow({
            contents: [
              contentRow({
                id: 'late',
                status: 'link_submitted',
                deadline: day(-10),
                video_submitted_at: day(-8),
              }),
            ],
          }),
        ],
      }),
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
    expect(item?.components.penalty.lines[0]).toMatchObject({
      contentId: 'late',
      amount: 30_000,
    });
    expect(item?.components.performanceBonus.status).toBe('waiting_for_data');
  });

  it('invoices the running contract, not an earlier one', () => {
    const item = toInvoiceItem(
      creatorRow({
        contracts: [
          contractRow({ id: 'old', start_date: day(-200), end_date: day(-61) }),
          contractRow({ id: 'running' }),
        ],
      }),
      FORMULA,
      TODAY,
    );

    expect(item?.contract.id).toBe('running');
  });

  it('marks a contract that has not started as upcoming, with no fixed rate earned yet', () => {
    const item = toInvoiceItem(
      creatorRow({
        contracts: [contractRow({ start_date: day(5), end_date: day(100) })],
      }),
      FORMULA,
      TODAY,
    );

    expect(item?.contract.status).toBe('upcoming');
    expect(item?.components.fixedRate.amount).toBe(0);
  });

  it('stops counting a never-delivered item at the day access was revoked', () => {
    const item = toInvoiceItem(
      creatorRow({
        access_revoke_date: day(-11),
        contracts: [
          contractRow({ contents: [contentRow({ deadline: day(-12) })] }),
        ],
      }),
      FORMULA,
      TODAY,
    );

    expect(item?.components.penalty.lines[0].basis.daysLate).toBe(1);
  });

  it('has nothing to invoice for a creator without a contract', () => {
    expect(
      toInvoiceItem(creatorRow({ contracts: [] }), FORMULA, TODAY),
    ).toBeNull();
  });
});
