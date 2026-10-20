import type { PrismaService } from '../prisma/prisma.service.js';
import {
  type InvoiceStatusRows,
  PersistedInvoiceStatusSource,
} from './persisted-invoice-status.source.js';

describe('PersistedInvoiceStatusSource', () => {
  it('is injected with the Prisma client, which runs the one query it needs', () => {
    expectTypeOf<PrismaService>().toExtend<InvoiceStatusRows>();
  });

  const prisma = { invoices: { findMany: vi.fn() } };
  const source = new PersistedInvoiceStatusSource(prisma);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.invoices.findMany.mockResolvedValue([]);
  });

  it('reads only the contract and status of the asked invoices, in one query', async () => {
    await source.statuses(['contract-1', 'contract-2']);

    expect(prisma.invoices.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.invoices.findMany).toHaveBeenCalledWith({
      where: { contract_id: { in: ['contract-1', 'contract-2'] } },
      select: { contract_id: true, status: true },
    });
  });

  it('reads a saved running invoice as accruing and a finalized one as finalized', async () => {
    prisma.invoices.findMany.mockResolvedValue([
      { contract_id: 'contract-1', status: 'running' },
      { contract_id: 'contract-2', status: 'finalized' },
    ]);

    const statuses = await source.statuses(['contract-1', 'contract-2']);

    expect(statuses).toEqual(
      new Map([
        ['contract-1', 'accruing'],
        ['contract-2', 'finalized'],
      ]),
    );
  });

  it('reads the steps after finalizing under their own names', async () => {
    prisma.invoices.findMany.mockResolvedValue([
      { contract_id: 'contract-1', status: 'creator_acked' },
      { contract_id: 'contract-2', status: 'payment_uploaded' },
      { contract_id: 'contract-3', status: 'paid' },
    ]);

    const statuses = await source.statuses([
      'contract-1',
      'contract-2',
      'contract-3',
    ]);

    expect(statuses).toEqual(
      new Map([
        ['contract-1', 'creator_acked'],
        ['contract-2', 'payment_uploaded'],
        ['contract-3', 'paid'],
      ]),
    );
  });

  it('reads a contract with no saved invoice yet as accruing', async () => {
    prisma.invoices.findMany.mockResolvedValue([
      { contract_id: 'contract-2', status: 'finalized' },
    ]);

    const statuses = await source.statuses(['contract-1', 'contract-2']);

    expect(statuses.get('contract-1')).toBe('accruing');
    expect(statuses.get('contract-2')).toBe('finalized');
    expect(statuses.size).toBe(2);
  });

  it('answers an empty map for no contracts without asking the database', async () => {
    await expect(source.statuses([])).resolves.toEqual(new Map());

    expect(prisma.invoices.findMany).not.toHaveBeenCalled();
  });

  // OWASP Top 10:2025 A10 (Mishandling of Exceptional Conditions): a status the lifecycle does
  // not know fails the read rather than being listed as some other status.
  it('fails closed on a saved status the lifecycle does not know', async () => {
    prisma.invoices.findMany.mockResolvedValue([
      { contract_id: 'contract-1', status: 'archived' },
    ]);

    await expect(source.statuses(['contract-1'])).rejects.toThrow(
      'Unsupported invoice status',
    );
  });
});
