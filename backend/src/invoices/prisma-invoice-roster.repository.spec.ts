import { CONTENT_SELECT, INVOICE_SELECT } from './invoice-rows.js';
import {
  PrismaInvoiceRosterRepository,
  type InvoiceRosterClient,
} from './prisma-invoice-roster.repository.js';

describe('PrismaInvoiceRosterRepository', () => {
  const prisma = {
    creators: { findMany: vi.fn() },
    contents: { findMany: vi.fn() },
  };
  const repository = new PrismaInvoiceRosterRepository(
    prisma as unknown as InvoiceRosterClient,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.creators.findMany.mockResolvedValue([]);
    prisma.contents.findMany.mockResolvedValue([]);
  });

  describe('creators', () => {
    it('reads every creator with a contract, in name order, with the invoice columns only', async () => {
      // Act
      await repository.creators({});

      // Assert
      expect(prisma.creators.findMany).toHaveBeenCalledExactlyOnceWith({
        where: { contracts: { some: {} } },
        select: INVOICE_SELECT,
        orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }, { id: 'asc' }],
      });
    });

    it('narrows the roster to a contract ending in the named range, in the query', async () => {
      // Act
      await repository.creators({
        contractEndFrom: '2026-10-01',
        contractEndTo: '2026-10-31',
      });

      // Assert
      expect(prisma.creators.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            contracts: {
              some: {
                end_date: {
                  gte: new Date('2026-10-01T00:00:00Z'),
                  lte: new Date('2026-10-31T00:00:00Z'),
                },
              },
            },
          },
        }),
      );
    });

    it('answers the rows as the database gives them', async () => {
      // Arrange
      const rows = [{ id: 'creator-1' }];
      prisma.creators.findMany.mockResolvedValue(rows);

      // Act
      const result = await repository.creators({});

      // Assert
      expect(result).toBe(rows);
    });
  });

  describe('contentsOf', () => {
    it("reads the requested contracts' content with its links in one query, in deadline order", async () => {
      // Act
      await repository.contentsOf(['contract-1', 'contract-2']);

      // Assert
      expect(prisma.contents.findMany).toHaveBeenCalledExactlyOnceWith({
        where: { contract_id: { in: ['contract-1', 'contract-2'] } },
        select: CONTENT_SELECT,
        orderBy: { deadline: 'asc' },
      });
    });

    it('groups the content by contract, keeping the order it was read in', async () => {
      // Arrange
      prisma.contents.findMany.mockResolvedValue([
        { id: 'a', contract_id: 'contract-1' },
        { id: 'b', contract_id: 'contract-2' },
        { id: 'c', contract_id: 'contract-1' },
      ]);

      // Act
      const byContract = await repository.contentsOf([
        'contract-1',
        'contract-2',
      ]);

      // Assert
      expect(
        [...byContract].map(([id, rows]) => [id, rows.map((row) => row.id)]),
      ).toEqual([
        ['contract-1', ['a', 'c']],
        ['contract-2', ['b']],
      ]);
    });

    it('reads nothing for no contracts', async () => {
      // Act
      const byContract = await repository.contentsOf([]);

      // Assert
      expect(byContract.size).toBe(0);
      expect(prisma.contents.findMany).not.toHaveBeenCalled();
    });
  });
});
