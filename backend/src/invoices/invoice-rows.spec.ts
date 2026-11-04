import { Prisma } from '@prisma/client';
import { FORMULA, SYNCED_AT, TODAY, day } from './invoice-test-data.js';
import {
  CONTENT_SELECT,
  INVOICE_SELECT,
  creatorName,
  listedContracts,
  pickContract,
  savedSnapshot,
  toInvoiceContent,
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
    content_links: [],
    ...overrides,
  };
}

type LinkRow = InvoiceContentRow['content_links'][number];

function linkRow(overrides: Partial<LinkRow> = {}): LinkRow {
  return {
    platform: 'instagram',
    views: null,
    likes: null,
    comments: null,
    shares: null,
    data_state: 'waiting',
    last_synced_at: null,
    manual_at: null,
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

describe('toInvoiceContent', () => {
  it('reads every link in the order handed in, with its four numbers, its state and where they came from (28.1)', () => {
    // Arrange
    const typedInLater = new Date(SYNCED_AT.getTime() + 60_000);
    const row = contentRow({
      status: 'link_submitted',
      video_submitted_at: day(-1),
      content_links: [
        linkRow({
          views: 41_200,
          likes: 900,
          comments: 12,
          shares: 3,
          data_state: 'synced',
          last_synced_at: SYNCED_AT,
        }),
        linkRow({
          platform: 'tiktok',
          likes: 1_000,
          data_state: 'manual',
          last_synced_at: SYNCED_AT,
          manual_at: typedInLater,
        }),
      ],
    });

    // Act
    const mapped = toInvoiceContent(row);

    // Assert
    expect(mapped).toMatchObject({ videoSubmittedAt: day(-1) });
    expect(mapped.links).toEqual([
      {
        platform: 'instagram',
        views: 41_200,
        likes: 900,
        comments: 12,
        shares: 3,
        state: 'synced',
        source: 'synced',
        lastSyncedAt: SYNCED_AT,
        manualAt: null,
      },
      {
        platform: 'tiktok',
        views: null,
        likes: 1_000,
        comments: null,
        shares: null,
        state: 'manual',
        source: 'manual',
        lastSyncedAt: SYNCED_AT,
        manualAt: typedInLater,
      },
    ]);
  });

  it('has no source for a link no sync or admin has measured yet', () => {
    expect(
      toInvoiceContent(contentRow({ content_links: [linkRow()] })).links,
    ).toEqual([expect.objectContaining({ source: null, lastSyncedAt: null })]);
  });

  it('has no links before the first, and leaves out one kept from before platforms were recorded', () => {
    expect(toInvoiceContent(contentRow()).links).toEqual([]);
    expect(
      toInvoiceContent(
        contentRow({ content_links: [linkRow({ platform: null, views: 9 })] }),
      ).links,
    ).toEqual([]);
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

// A creator whose contract was renewed still has the earlier one's invoice to finalize and pay:
// each ended contract gets its own row next to the one the table describes.
describe('listedContracts', () => {
  const ids = (contracts: InvoiceContractRow[]) => contracts.map(({ id }) => id);

  it('lists the current contract and, after it, every earlier one that has ended', () => {
    const row = creatorRow({
      contracts: [
        contractRow({ id: 'old', start_date: day(-200), end_date: day(-61) }),
        contractRow({ id: 'running' }),
        contractRow({ id: 'older', start_date: day(-400), end_date: day(-201) }),
      ],
    });

    expect(ids(listedContracts(row, TODAY))).toEqual(['running', 'old', 'older']);
  });

  it('lists both of two ended contracts, the one the table describes first', () => {
    const row = creatorRow({
      contracts: [
        contractRow({ id: 'old', start_date: day(-200), end_date: day(-61) }),
        contractRow({ id: 'latest', start_date: day(-60), end_date: day(-1) }),
      ],
    });

    expect(ids(listedContracts(row, TODAY))).toEqual(['latest', 'old']);
  });

  it('leaves out a contract still to come after the current one', () => {
    const row = creatorRow({
      contracts: [
        contractRow({ id: 'running' }),
        contractRow({ id: 'next', start_date: day(61), end_date: day(200) }),
      ],
    });

    expect(ids(listedContracts(row, TODAY))).toEqual(['running']);
  });

  it('lists nothing for a creator without a contract', () => {
    expect(listedContracts(creatorRow({ contracts: [] }), TODAY)).toEqual([]);
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
        lastDay: '2026-11-17',
        period: 1,
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

  // An early end moves the day the contract stops, not its end date: the period still reads as
  // agreed, and lastDay is what finalizing waits for.
  it('gives the day access was revoked as the last day of a contract that ended early', () => {
    const item = toInvoiceItem(
      creatorRow({ access_revoke_date: day(-11) }),
      contractRow(),
      [],
      FORMULA,
      TODAY,
    );

    expect(item.contract).toMatchObject({
      endDate: '2026-11-17',
      lastDay: '2026-09-07',
    });
  });

  // OWASP Top 10:2025 A06 (Insecure Design): the contract column, its filter and the
  // needs-action order all read an early end as the end, as finalizing does.
  it('marks a contract that ended early as ended, although its end date has not come', () => {
    const item = toInvoiceItem(
      creatorRow({ access_revoke_date: day(-11) }),
      contractRow(),
      [],
      FORMULA,
      TODAY,
    );

    expect(item.contract.status).toBe('expired');
  });

  it('keeps a contract running on the day access is revoked', () => {
    const item = toInvoiceItem(
      creatorRow({ access_revoke_date: day(0) }),
      contractRow(),
      [],
      FORMULA,
      TODAY,
    );

    expect(item.contract.status).toBe('active');
  });

  it('numbers each contract by the period it pays, counted in the order they started', () => {
    const first = contractRow({ id: 'first', start_date: day(-200), end_date: day(-61) });
    const renewal = contractRow({ id: 'renewal' });
    const row = creatorRow({ contracts: [renewal, first] });

    expect(toInvoiceItem(row, first, [], FORMULA, TODAY).contract.period).toBe(1);
    expect(toInvoiceItem(row, renewal, [], FORMULA, TODAY).contract.period).toBe(2);
  });

  it('keeps the end date as the last day when access is revoked after it', () => {
    const ended = contractRow({ start_date: day(-60), end_date: day(-5) });
    const item = toInvoiceItem(
      creatorRow({ access_revoke_date: day(-1), contracts: [ended] }),
      ended,
      [],
      FORMULA,
      TODAY,
    );

    expect(item.contract.lastDay).toBe('2026-09-13');
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

  // The listing sums adjustments in the database and reads their rows for its page only.
  it('totals with the adjustment sum it is given rather than the rows it lists', () => {
    const unpaid = contractRow({ fixed_rate: new Prisma.Decimal('0') });
    const item = toInvoiceItem(
      creatorRow({ contracts: [unpaid] }),
      unpaid,
      [],
      FORMULA,
      TODAY,
      {
        adjustments: [],
        adjustmentTotal: new Prisma.Decimal('-1500.25'),
        snapshot: null,
      },
    );

    expect(item).toMatchObject({
      adjustments: [],
      rawTotal: -1500.25,
      total: 0,
      floored: true,
    });
  });

  it('reads a null adjustment sum, a sum over no rows, as no adjustments', () => {
    const item = toInvoiceItem(
      creatorRow(),
      contractRow(),
      [],
      FORMULA,
      TODAY,
      {
        adjustments: [],
        adjustmentTotal: null,
        snapshot: null,
      },
    );

    expect(item).toMatchObject({ rawTotal: 5_500_000, total: 5_500_000 });
  });

  it('holds a running total at zero when a negative adjustment outweighs the pay', () => {
    const item = toInvoiceItem(
      creatorRow(),
      contractRow(),
      [],
      FORMULA,
      TODAY,
      {
        adjustments: [
          {
            id: 'adj-1',
            amount: -6_000_000,
            reason: 'Pengembalian dana',
            actorId: 'admin-1',
            createdAt: '2026-09-17T00:00:00.000Z',
          },
        ],
        snapshot: null,
      },
    );

    expect(item).toMatchObject({
      rawTotal: -500_000,
      total: 0,
      floored: true,
    });
  });

  // OWASP Top 10:2025 A08 (Software and Data Integrity Failures): a finalized invoice is read
  // from its snapshot, never recalculated from live content or the current formula.
  it('returns the persisted snapshot of a finalized invoice instead of recalculating it', () => {
    const component = (amount: number) => ({
      amount,
      status: 'calculated' as const,
      lines: [],
    });
    const adjustments = [
      {
        id: 'adj-1',
        amount: 25_000,
        reason: 'Approved campaign adjustment',
        actorId: 'admin-1',
        createdAt: '2026-09-10T00:00:00.000Z',
      },
    ];
    const snapshot = {
      fixedRate: component(5_500_000),
      additionalContent: component(100_000),
      performanceBonus: component(0),
      penalty: component(0),
      adjustments,
      rawTotal: 5_625_000,
      total: 5_625_000,
      floored: false,
      finalizedAt: '2026-09-12T03:00:00.000Z',
    };

    const item = toInvoiceItem(
      creatorRow(),
      contractRow({ fixed_rate: new Prisma.Decimal('9000000') }),
      [
        contentRow({
          id: 'late',
          status: 'link_submitted',
          deadline: day(-10),
          video_submitted_at: day(-8),
        }),
      ],
      { ...FORMULA, latePenaltyPerDay: 1_000_000 },
      TODAY,
      { adjustments, snapshot },
    );

    // Where it stands is the InvoiceStatusSource's to say, not the row mapping's.
    expect(item).not.toHaveProperty('invoiceStatus');
    expect(item).toMatchObject({
      adjustments,
      snapshot,
      components: {
        fixedRate: snapshot.fixedRate,
        additionalContent: snapshot.additionalContent,
        performanceBonus: snapshot.performanceBonus,
        penalty: snapshot.penalty,
      },
      rawTotal: 5_625_000,
      total: 5_625_000,
      floored: false,
    });
  });
});

describe('the columns an invoice is read from', () => {
  it('reads only the creator and contract columns the calculation needs', () => {
    expect(INVOICE_SELECT).toEqual({
      id: true,
      first_name: true,
      middle_name: true,
      last_name: true,
      access_revoke_date: true,
      contracts: {
        select: {
          id: true,
          start_date: true,
          end_date: true,
          content_quota: true,
          fixed_rate: true,
        },
      },
    });
  });

  it('reads only the content columns the calculation needs', () => {
    expect(CONTENT_SELECT).toEqual({
      id: true,
      contract_id: true,
      name: true,
      type: true,
      status: true,
      deadline: true,
      video_submitted_at: true,
      // Every link is judged on its own platform's numbers (28.1).
      content_links: {
        orderBy: [{ submitted_at: 'asc' }, { created_at: 'asc' }],
        select: {
          platform: true,
          views: true,
          likes: true,
          comments: true,
          shares: true,
          data_state: true,
          last_synced_at: true,
          manual_at: true,
        },
      },
    });
  });
});

// OWASP Top 10:2025 A08 (Software and Data Integrity Failures): a saved snapshot is read back
// only when it holds the whole final breakdown and totals, instead of being trusted by a cast.
describe('savedSnapshot', () => {
  const component = { amount: 1_000_000, status: 'calculated', lines: [] };
  const complete = {
    fixedRate: component,
    additionalContent: component,
    performanceBonus: component,
    penalty: { ...component, amount: null, status: 'waiting_for_data' },
    adjustments: [],
    rawTotal: 3_000_000,
    total: 3_000_000,
    floored: false,
    finalizedAt: '2026-09-12T03:00:00.000Z',
  };

  it('reads back a snapshot holding every component and total', () => {
    expect(savedSnapshot(complete)).toBe(complete);
  });

  it('reads back the formula kept with a snapshot, or a null one', () => {
    // As the jsonb column hands it back: plain JSON, not a RateFormula.
    const formula = {
      latePenaltyPerDay: 15_000,
      maxPenaltyDays: 3,
      specificBonus: 100_000,
      performanceBonus: {
        tiktok: {
          metric: 'likes',
          tiers: [{ threshold: 1_000, bonus: 50_000 }],
        },
      },
    };
    const withFormula = { ...complete, formula };
    const withoutOne = { ...complete, formula: null };

    expect(savedSnapshot(withFormula)).toBe(withFormula);
    expect(savedSnapshot(withoutOne)).toBe(withoutOne);
  });

  it('reads no snapshot for an invoice that has none', () => {
    expect(savedSnapshot(null)).toBeNull();
  });

  // Tolerant Reader (PBI-28 AC 10-11): snapshots saved before links were frozen and after both
  // read; a frozen part that cannot be trusted is left out, never the whole snapshot, since an
  // unreadable snapshot would send a finalized invoice back to a live calculation.
  describe('the frozen links (PBI-28 AC 10)', () => {
    const link = {
      contentId: 'content-1',
      contentName: 'Evg_1',
      platform: 'tiktok',
      views: 12_400,
      likes: 0,
      comments: null,
      shares: null,
      source: 'synced',
      state: 'synced',
      lastSyncedAt: '2026-10-30T19:00:00.000Z',
    };

    it('reads a snapshot saved before links were frozen as it was', () => {
      expect(savedSnapshot(complete)).not.toHaveProperty('performanceLinks');
    });

    it.each([
      ['a synced link', [link]],
      [
        'a manual link',
        [{ ...link, source: 'manual', state: 'manual', lastSyncedAt: null }],
      ],
      [
        'a link that never had numbers',
        [
          {
            ...link,
            views: null,
            likes: null,
            source: null,
            state: 'waiting',
            lastSyncedAt: null,
          },
        ],
      ],
      ['no link at all', []],
    ])('reads back the frozen links of %s', (_, performanceLinks) => {
      const saved = { ...complete, performanceLinks };

      expect(savedSnapshot(saved)).toBe(saved);
    });

    // OWASP A08:2025 Software or Data Integrity Failures: a frozen list that is not what Finalize
    // writes is never shown as if it were, and the frozen totals still stand.
    it.each([
      ['not a list', { links: [link] }],
      ['a link without a content', [{ ...link, contentId: 7 }]],
      ['an unknown platform', [{ ...link, platform: 'youtube' }]],
      ['a negative number', [{ ...link, views: -1 }]],
      ['a fractional number', [{ ...link, likes: 1.5 }]],
      ['an unknown source', [{ ...link, source: 'guessed' }]],
      ['an unknown state', [{ ...link, state: 'stale' }]],
      ['a sync time that is not text', [{ ...link, lastSyncedAt: 0 }]],
      ['a link that is not an object', [null]],
    ])(
      'keeps the snapshot but leaves out frozen links holding %s',
      (_, performanceLinks) => {
        const read = savedSnapshot({ ...complete, performanceLinks });

        expect(read).toEqual(complete);
        expect(read).not.toHaveProperty('performanceLinks');
      },
    );
  });

  it.each([
    ['a string', 'snapshot'],
    ['an array', [complete]],
    ['no fixed rate', { ...complete, fixedRate: undefined }],
    ['a component that is not an object', { ...complete, penalty: 0 }],
    [
      'a component amount in text',
      { ...complete, additionalContent: { ...component, amount: '10' } },
    ],
    [
      'a component without a status',
      { ...complete, performanceBonus: { ...component, status: undefined } },
    ],
    [
      'a component without lines',
      { ...complete, fixedRate: { ...component, lines: undefined } },
    ],
    ['no adjustments', { ...complete, adjustments: undefined }],
    ['a raw total in text', { ...complete, rawTotal: '3000000' }],
    ['no total', { ...complete, total: undefined }],
    ['no floored flag', { ...complete, floored: undefined }],
    ['no finalization time', { ...complete, finalizedAt: undefined }],
    ['a formula that is not an object', { ...complete, formula: 'FORMULA' }],
  ])('reads a saved value with %s as no usable snapshot', (_case, value) => {
    expect(savedSnapshot(value)).toBeNull();
  });
});
