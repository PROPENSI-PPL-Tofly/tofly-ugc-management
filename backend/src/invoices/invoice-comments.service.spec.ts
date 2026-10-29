import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  InvoiceCommentsService,
  type InvoiceCommentsClient,
} from './invoice-comments.service.js';

const CONTRACT = '11111111-1111-4111-8111-111111111111';
const OTHER_CONTRACT = '22222222-2222-4222-8222-222222222222';
const INVOICE = '33333333-3333-4333-8333-333333333333';
const ADMIN = '44444444-4444-4444-8444-444444444444';
const CREATOR = '55555555-5555-4555-8555-555555555555';
const CREATOR_USER = '66666666-6666-4666-8666-666666666666';

const RANGGA = {
  first_name: 'Rangga',
  middle_name: null,
  last_name: 'Pratama',
};
const AT = new Date('2026-10-20T03:00:00.000Z');
const LATER = new Date('2026-10-20T04:00:00.000Z');

const NAMES = { first_name: true, middle_name: true, last_name: true };
const COMMENT_SELECT = {
  id: true,
  author_role: true,
  text: true,
  created_at: true,
};
const OLDEST_FIRST = [{ created_at: 'asc' }, { id: 'asc' }];
const NOT_FOUND = {
  code: 'INVOICE_NOT_FOUND',
  message: 'Invoice tidak ditemukan',
};

function stubs() {
  const prisma = {
    contracts: { findFirst: vi.fn() },
    invoices: { upsert: vi.fn() },
    invoice_comments: { create: vi.fn(), findMany: vi.fn() },
    // The transaction client is the same stub, so each test reads what ran inside it.
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(
    (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
  );
  prisma.contracts.findFirst.mockResolvedValue({
    id: CONTRACT,
    creators: { ...RANGGA, user_id: CREATOR_USER },
    invoice: null,
  });
  prisma.invoices.upsert.mockResolvedValue({ id: INVOICE });

  const service = new InvoiceCommentsService(
    prisma as unknown as InvoiceCommentsClient,
  );
  return { prisma, service };
}

async function refusalOf(work: Promise<unknown>) {
  return (await work.then(
    () => expect.unreachable('the call must be refused'),
    (thrown: unknown) => thrown,
  )) as NotFoundException;
}

describe('InvoiceCommentsService', () => {
  let prisma: ReturnType<typeof stubs>['prisma'];
  let service: InvoiceCommentsService;

  beforeEach(() => {
    ({ prisma, service } = stubs());
  });

  it('is injected with the Prisma client, which runs every query it needs', () => {
    expectTypeOf<PrismaService>().toExtend<InvoiceCommentsClient>();
  });

  describe('list', () => {
    it('reads the thread oldest first in one query, the admin as "Admin" and the creator by name', async () => {
      prisma.contracts.findFirst.mockResolvedValue({
        id: CONTRACT,
        creators: {
          first_name: 'Rangga',
          middle_name: 'Adi',
          last_name: 'Pratama',
        },
        invoice: {
          comments: [
            {
              id: 'c1',
              author_role: 'creator',
              text: 'Halo kak',
              created_at: AT,
            },
            {
              id: 'c2',
              author_role: 'admin',
              text: 'Sudah dicek',
              created_at: LATER,
            },
          ],
        },
      });

      await expect(service.list(CONTRACT, {})).resolves.toEqual([
        {
          id: 'c1',
          authorName: 'Rangga Adi Pratama',
          authorRole: 'creator',
          text: 'Halo kak',
          createdAt: '2026-10-20T03:00:00.000Z',
        },
        {
          id: 'c2',
          authorName: 'Admin',
          authorRole: 'admin',
          text: 'Sudah dicek',
          createdAt: '2026-10-20T04:00:00.000Z',
        },
      ]);
      expect(prisma.contracts.findFirst).toHaveBeenCalledExactlyOnceWith({
        where: { id: CONTRACT },
        select: {
          id: true,
          creators: { select: NAMES },
          invoice: {
            select: {
              comments: { select: COMMENT_SELECT, orderBy: OLDEST_FIRST },
            },
          },
        },
      });
      // An admin's lookup carries no creator_id key at all, not even undefined.
      expect(prisma.contracts.findFirst.mock.calls[0][0].where).toStrictEqual({
        id: CONTRACT,
      });
    });

    it('answers an empty thread, not an error, for a contract with no invoice row yet', async () => {
      await expect(service.list(CONTRACT, {})).resolves.toEqual([]);
    });

    // OWASP Top 10:2025 A01 (Broken Access Control): a creator's lookup is scoped to their own
    // contracts, and another creator's contract answers as a missing one.
    it("scopes a creator to their own contracts and answers another's as not found", async () => {
      prisma.contracts.findFirst.mockResolvedValue(null);

      const error = await refusalOf(
        service.list(CONTRACT, { creatorId: CREATOR }),
      );

      expect(prisma.contracts.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CONTRACT, creator_id: CREATOR },
        }),
      );
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getResponse()).toEqual(NOT_FOUND);
    });
  });

  describe('add', () => {
    // Comments are open at every stage: a running contract nobody has adjusted yet gets its
    // invoice row with its first comment, as an adjustment does.
    it("saves an admin's comment as the admin's, opening the invoice row if there is none", async () => {
      prisma.invoice_comments.create.mockResolvedValue({
        id: 'c9',
        author_role: 'admin',
        text: 'Bukti sudah diupload',
        created_at: AT,
      });

      await expect(
        service.add(
          CONTRACT,
          { text: 'Bukti sudah diupload' },
          { role: 'admin', userId: ADMIN },
        ),
      ).resolves.toEqual({
        id: 'c9',
        authorName: 'Admin',
        authorRole: 'admin',
        text: 'Bukti sudah diupload',
        createdAt: '2026-10-20T03:00:00.000Z',
      });
      expect(prisma.contracts.findFirst.mock.calls[0][0]).toStrictEqual({
        where: { id: CONTRACT },
        select: { id: true, creators: { select: { ...NAMES, user_id: true } } },
      });
      expect(prisma.invoices.upsert).toHaveBeenCalledWith({
        where: { contract_id: CONTRACT },
        create: { contract_id: CONTRACT },
        update: {},
        select: { id: true },
      });
      expect(prisma.invoice_comments.create).toHaveBeenCalledWith({
        data: {
          invoice_id: INVOICE,
          author_user_id: ADMIN,
          author_role: 'admin',
          text: 'Bukti sudah diupload',
        },
        select: COMMENT_SELECT,
      });
    });

    // The creator guard's local stand-in resolves only a creator id, so the author's user is
    // read from the contract's creator, the one creator who can write on it.
    it("saves a creator's comment as the contract's own creator's user, by name", async () => {
      prisma.invoice_comments.create.mockResolvedValue({
        id: 'c10',
        author_role: 'creator',
        text: 'Terima kasih',
        created_at: AT,
      });

      const saved = await service.add(
        CONTRACT,
        { text: 'Terima kasih' },
        { role: 'creator', creatorId: CREATOR },
      );

      expect(saved.authorName).toBe('Rangga Pratama');
      expect(prisma.contracts.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CONTRACT, creator_id: CREATOR },
        }),
      );
      expect(prisma.invoice_comments.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            author_user_id: CREATOR_USER,
            author_role: 'creator',
          }),
        }),
      );
    });

    // A failure between opening the invoice row and saving the comment must not leave an invoice
    // row with no comment behind (review on #109): both are one transaction, one round trip.
    it('opens the invoice row and saves the comment in one transaction', async () => {
      const tx = {
        invoices: { upsert: vi.fn().mockResolvedValue({ id: INVOICE }) },
        invoice_comments: {
          create: vi.fn().mockResolvedValue({
            id: 'c11',
            author_role: 'admin',
            text: 'Halo',
            created_at: AT,
          }),
        },
      };
      prisma.$transaction.mockImplementation(
        (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      );

      await service.add(
        CONTRACT,
        { text: 'Halo' },
        { role: 'admin', userId: ADMIN },
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.invoices.upsert).toHaveBeenCalledTimes(1);
      expect(tx.invoice_comments.create).toHaveBeenCalledTimes(1);
      expect(prisma.invoices.upsert).not.toHaveBeenCalled();
      expect(prisma.invoice_comments.create).not.toHaveBeenCalled();
    });

    it("writes nothing on a contract that is not the creator's", async () => {
      prisma.contracts.findFirst.mockResolvedValue(null);

      const error = await refusalOf(
        service.add(
          OTHER_CONTRACT,
          { text: 'Halo' },
          { role: 'creator', creatorId: CREATOR },
        ),
      );

      expect(error.getResponse()).toEqual(NOT_FOUND);
      expect(prisma.invoices.upsert).not.toHaveBeenCalled();
      expect(prisma.invoice_comments.create).not.toHaveBeenCalled();
    });
  });

  describe('forContracts', () => {
    it("groups every asked contract's thread in one query, keeping each oldest first", async () => {
      const contractOf = (contract_id: string) => ({
        contract_id,
        contracts: { creators: RANGGA },
      });
      prisma.invoice_comments.findMany.mockResolvedValue([
        {
          id: 'c1',
          author_role: 'creator',
          text: 'a',
          created_at: AT,
          invoices: contractOf(CONTRACT),
        },
        {
          id: 'c2',
          author_role: 'admin',
          text: 'b',
          created_at: AT,
          invoices: contractOf(OTHER_CONTRACT),
        },
        {
          id: 'c3',
          author_role: 'admin',
          text: 'c',
          created_at: LATER,
          invoices: contractOf(CONTRACT),
        },
      ]);

      const threads = await service.forContracts([CONTRACT, OTHER_CONTRACT]);

      expect(prisma.invoice_comments.findMany).toHaveBeenCalledExactlyOnceWith({
        where: {
          invoices: { contract_id: { in: [CONTRACT, OTHER_CONTRACT] } },
        },
        select: {
          ...COMMENT_SELECT,
          invoices: {
            select: {
              contract_id: true,
              contracts: { select: { creators: { select: NAMES } } },
            },
          },
        },
        orderBy: OLDEST_FIRST,
      });
      expect(threads.get(CONTRACT)?.map(({ id }) => id)).toEqual(['c1', 'c3']);
      expect(threads.get(OTHER_CONTRACT)?.[0].authorName).toBe('Admin');
    });

    it('asks nothing for an empty page', async () => {
      await expect(service.forContracts([])).resolves.toEqual(new Map());
      expect(prisma.invoice_comments.findMany).not.toHaveBeenCalled();
    });
  });
});
