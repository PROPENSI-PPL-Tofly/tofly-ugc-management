import { PrismaInvoiceExportReader } from './prisma-invoice-export.reader.js';

const INVOICE_ID = '11111111-1111-4111-8111-111111111111';
const CONTRACT_ID = '22222222-2222-4222-8222-222222222222';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    status: 'finalized',
    finalized_at: new Date('2026-07-15T07:00:00.000Z'),
    acknowledged_at: new Date('2026-07-16T07:00:00.000Z'),
    paid_at: null,
    snapshot: {
      fixedRate: { amount: 1_250_000, status: 'calculated', lines: [] },
      additionalContent: { amount: 200_000, status: 'calculated', lines: [] },
      performanceBonus: { amount: 50_000, status: 'calculated', lines: [] },
      penalty: { amount: 0, status: 'calculated', lines: [] },
      adjustments: [{ reason: 'Koreksi', amount: 25_000, actorId: 'admin-1' }],
      rawTotal: 1_525_000,
      total: 1_525_000,
      floored: false,
      finalizedAt: '2026-07-15T07:00:00.000Z',
    },
    contracts: {
      id: CONTRACT_ID,
      start_date: new Date('2026-07-01T00:00:00.000Z'),
      end_date: new Date('2026-07-31T00:00:00.000Z'),
      creators: {
        id: '33333333-3333-4333-8333-333333333333',
        first_name: 'Budi',
        middle_name: null,
        last_name: 'Santoso',
        access_revoke_date: null,
        users: { email: 'budi@example.com' },
        contracts: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            start_date: new Date('2026-01-01T00:00:00.000Z'),
          },
          { id: CONTRACT_ID, start_date: new Date('2026-07-01T00:00:00.000Z') },
        ],
      },
    },
    ...overrides,
  };
}

function readerFor(rows: unknown[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  return { reader: new PrismaInvoiceExportReader({ invoices: { findMany } } as never), findMany };
}

describe('PrismaInvoiceExportReader (31.4)', () => {
  it('queries only the requested invoices and reads their frozen snapshot', async () => {
    const { reader, findMany } = readerFor([row()]);

    const sources = await reader.read([INVOICE_ID]);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [INVOICE_ID] } } }),
    );
    expect(sources).toEqual([
      {
        id: INVOICE_ID,
        status: 'finalized',
        creatorName: 'Budi Santoso',
        creatorEmail: 'budi@example.com',
        period: 2,
        contractPeriod: '2026-07-01 s.d. 2026-07-31',
        fixedRate: 1_250_000,
        additionalContent: 200_000,
        performanceBonus: 50_000,
        penalty: 0,
        adjustments: [
          { reason: 'Koreksi', amount: 25_000, corrected: true },
        ],
        total: 1_525_000,
        finalizedAt: '2026-07-15T07:00:00.000Z',
        acknowledgedAt: '2026-07-16T07:00:00.000Z',
        paidAt: null,
      },
    ]);
  });

  it('leaves lifecycle dates null until someone makes that move', async () => {
    const { reader } = readerFor([
      row({ finalized_at: null, acknowledged_at: null }),
    ]);
    const [source] = await reader.read([INVOICE_ID]);
    expect(source.finalizedAt).toBeNull();
    expect(source.acknowledgedAt).toBeNull();
    expect(source.paidAt).toBeNull();
  });

  it('treats an invoice without a usable snapshot as running, so it is skipped', async () => {
    const { reader } = readerFor([row({ status: 'paid', snapshot: null })]);
    expect((await reader.read([INVOICE_ID]))[0].status).toBe('accruing');
  });

  it('keeps the contract period when a contract was ended early', async () => {
    const value = row({
      contracts: {
        ...row().contracts,
        end_date: new Date('2026-07-10T00:00:00.000Z'),
      },
    });
    const { reader } = readerFor([value]);
    expect((await reader.read([INVOICE_ID]))[0].contractPeriod).toBe(
      '2026-07-01 s.d. 2026-07-10',
    );
  });
});
