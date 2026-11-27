import {
  ContractFactsMissing,
  PrismaContractFacts,
  type ContractFactsClient,
} from './contract-facts.js';

const CONTRACT = '22222222-2222-4222-8222-222222222222';

function row(overrides: { snapshot?: unknown; invoice?: null } = {}) {
  return {
    id: CONTRACT,
    creators: {
      contracts: [{ id: 'first' }, { id: CONTRACT }, { id: 'third' }],
    },
    invoice:
      overrides.invoice === null
        ? null
        : {
            snapshot:
              'snapshot' in overrides
                ? overrides.snapshot
                : { total: 1_250_000 },
          },
  };
}

function setup(found: unknown = row()) {
  const prisma = {
    contracts: { findUnique: vi.fn().mockResolvedValue(found) },
  } as unknown as ContractFactsClient & {
    contracts: { findUnique: ReturnType<typeof vi.fn> };
  };
  return { prisma, facts: new PrismaContractFacts(prisma) };
}

describe('PrismaContractFacts (11.4)', () => {
  it('numbers the period as Pembayaran does: by start date, the first one 1', async () => {
    const { prisma, facts } = setup();

    await expect(facts.period(CONTRACT)).resolves.toEqual({ periodNumber: 2 });
    expect(prisma.contracts.findUnique).toHaveBeenCalledWith({
      where: { id: CONTRACT },
      select: expect.objectContaining({
        creators: {
          select: {
            contracts: {
              select: { id: true },
              orderBy: [{ start_date: 'asc' }, { id: 'asc' }],
            },
          },
        },
      }),
    });
  });

  it('reads the total saved on the invoice', async () => {
    const { facts } = setup();

    await expect(facts.invoice(CONTRACT)).resolves.toEqual({
      periodNumber: 2,
      total: 1_250_000,
    });
  });

  it('keeps a total held at zero as zero', async () => {
    const { facts } = setup(row({ snapshot: { total: 0 } }));

    await expect(facts.invoice(CONTRACT)).resolves.toEqual({
      periodNumber: 2,
      total: 0,
    });
  });

  // The email is marked failed and the 08:00 run tries again, rather than an email with no amount.
  it.each([
    ['a contract that is gone', null],
    ['a contract without an invoice', row({ invoice: null })],
    ['an invoice not finalized yet', row({ snapshot: null })],
    ['a snapshot without a total', row({ snapshot: { rawTotal: 5 } })],
  ])('refuses %s', async (_, found) => {
    const { facts } = setup(found);

    await expect(facts.invoice(CONTRACT)).rejects.toThrow(ContractFactsMissing);
  });

  it('refuses a period of a contract that is gone', async () => {
    const { facts } = setup(null);

    await expect(facts.period(CONTRACT)).rejects.toThrow(ContractFactsMissing);
  });
});
