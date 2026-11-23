import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ContractPeriodsService,
  type PeriodsClient,
} from './contract-periods.service.js';
import type { ContractTerms } from './new-creator.js';

// 10:00 WIB on 18 November 2026.
const NOW = new Date('2026-11-18T03:00:00Z');
const CREATOR_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const CURRENT_ID = '22222222-2222-4222-8222-222222222222';
const NEXT_ID = '33333333-3333-4333-8333-333333333333';

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Period 2, the day after period 1 ends. */
const TERMS: ContractTerms = {
  contractType: 'regular',
  contractStart: day('2026-12-01'),
  contractEnd: day('2027-01-31'),
  interval: 14,
  quota: 2,
  fixedRate: 1_500_000,
  deadlines: [day('2026-12-06'), day('2026-12-20')],
};

/** Period 1, running today. */
const CURRENT = {
  id: CURRENT_ID,
  start_date: day('2026-06-01'),
  end_date: day('2026-11-30'),
  contents: [],
};

/** A period 2 already saved, not started yet. */
const NEXT = {
  id: NEXT_ID,
  start_date: day('2026-12-01'),
  end_date: day('2027-01-31'),
  contents: [] as { name: string; deadline: Date }[],
};

const SAVED = {
  id: NEXT_ID,
  start_date: day('2026-12-01'),
  end_date: day('2027-01-31'),
  invoice: { id: 'invoice-2' },
  contents: [
    {
      id: 'content-1',
      name: 'Evg_1_Rangga Pratama_06122026',
      deadline: day('2026-12-06'),
    },
    {
      id: 'content-2',
      name: 'Evg_2_Rangga Pratama_20122026',
      deadline: day('2026-12-20'),
    },
  ],
};

const RESULT = {
  contractId: NEXT_ID,
  invoiceId: 'invoice-2',
  startDate: '2026-12-01',
  endDate: '2027-01-31',
  contents: [
    {
      id: 'content-1',
      name: 'Evg_1_Rangga Pratama_06122026',
      deadline: '2026-12-06',
    },
    {
      id: 'content-2',
      name: 'Evg_2_Rangga Pratama_20122026',
      deadline: '2026-12-20',
    },
  ],
};

/** What a saved period is read back with: its invoice and only its Evergreen schedule, in date order. */
const SAVED_SELECT = {
  id: true,
  start_date: true,
  end_date: true,
  invoice: { select: { id: true } },
  contents: {
    where: { type: 'evergreen' },
    select: { id: true, name: true, deadline: true },
    orderBy: { deadline: 'asc' },
  },
};

/** The Evergreen rows the schedule creates, as the nested write receives them. */
const SCHEDULE = [
  expect.objectContaining({
    name: 'Evg_1_Rangga Pratama_06122026',
    type: 'evergreen',
    deadline: day('2026-12-06'),
    status: 'scheduled',
    content_events: {
      create: expect.objectContaining({
        event_type: 'Scheduled',
        actor_user_id: ADMIN_ID,
        occurred_at: NOW,
      }),
    },
  }),
  expect.objectContaining({
    name: 'Evg_2_Rangga Pratama_20122026',
    deadline: day('2026-12-20'),
  }),
];

function setup(contracts: unknown[] | null) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    creators: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          contracts === null
            ? null
            : {
                first_name: 'Rangga',
                middle_name: null,
                last_name: 'Pratama',
                contracts,
              },
        ),
    },
    contracts: {
      create: vi.fn().mockResolvedValue(SAVED),
      update: vi.fn().mockResolvedValue(SAVED),
      delete: vi.fn().mockResolvedValue({}),
    },
    contents: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
  };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const service = new ContractPeriodsService(
    prisma as unknown as PeriodsClient,
  );
  return { tx, prisma, service };
}

/** The raw statements in the order the transaction ran them. */
function locks(
  tx: ReturnType<typeof setup>['tx'],
): { sql: string; values: unknown[] }[] {
  return tx.$queryRaw.mock.calls.map((call: unknown[]) => {
    const query = call[0] as Prisma.Sql;
    return { sql: query.sql, values: query.values };
  });
}

async function rejection(
  work: Promise<unknown>,
): Promise<{ error: unknown; body: Record<string, unknown> }> {
  const error = await work.then(
    () => {
      throw new Error('expected a rejection');
    },
    (reason: unknown) => reason,
  );
  return {
    error,
    body: (error as { getResponse(): Record<string, unknown> }).getResponse(),
  };
}

describe('ContractPeriodsService.create', () => {
  it('locks the creator, then saves the period with its own invoice and Evergreen schedule', async () => {
    const { tx, service } = setup([CURRENT]);

    await expect(
      service.create(CREATOR_ID, TERMS, NOW, ADMIN_ID),
    ).resolves.toEqual(RESULT);

    expect(locks(tx)).toEqual([
      {
        sql: expect.stringMatching(/FROM creators .*FOR UPDATE/s),
        values: [CREATOR_ID],
      },
    ]);
    expect(tx.creators.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CREATOR_ID } }),
    );
    expect(tx.contracts.create).toHaveBeenCalledWith({
      data: {
        creator_id: CREATOR_ID,
        start_date: day('2026-12-01'),
        end_date: day('2027-01-31'),
        contract_type: 'regular',
        days_between: 14,
        content_quota: 2,
        fixed_rate: 1_500_000,
        invoice: { create: {} },
        contents: { create: SCHEDULE },
      },
      select: SAVED_SELECT,
    });
  });

  it('records a schedule made behind the development stand-in without an admin id', async () => {
    const { tx, service } = setup([CURRENT]);

    await service.create(CREATOR_ID, TERMS, NOW);

    const [{ data }] = tx.contracts.create.mock.calls[0] as [
      {
        data: {
          contents: { create: { content_events: { create: unknown } }[] };
        };
      },
    ];
    expect(data.contents.create[0].content_events.create).toEqual(
      expect.objectContaining({ actor_user_id: null }),
    );
  });

  it('answers 404 for a creator that does not exist, saving nothing', async () => {
    const { tx, service } = setup(null);

    const { error, body } = await rejection(
      service.create(CREATOR_ID, TERMS, NOW, ADMIN_ID),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(body).toEqual({
      code: 'CREATOR_NOT_FOUND',
      message: 'Creator tidak ditemukan',
    });
    expect(tx.contracts.create).not.toHaveBeenCalled();
  });

  it('refuses a period overlapping another, under the start date', async () => {
    const { tx, service } = setup([
      { ...CURRENT, end_date: day('2026-12-01') },
    ]);

    const { error, body } = await rejection(
      service.create(CREATOR_ID, TERMS, NOW, ADMIN_ID),
    );

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(body).toEqual({
      message: 'Data periode tidak valid',
      errors: {
        contractStart:
          'Periode bertabrakan dengan kontrak 1 Jun 2026 – 1 Des 2026',
      },
    });
    expect(tx.contracts.create).not.toHaveBeenCalled();
  });

  it('refuses a period overlapping one that has not started either', async () => {
    const { service } = setup([CURRENT, NEXT]);

    const { body } = await rejection(
      service.create(CREATOR_ID, TERMS, NOW, ADMIN_ID),
    );

    expect(body.errors).toEqual({
      contractStart:
        'Periode bertabrakan dengan kontrak 1 Des 2026 – 31 Jan 2027',
    });
  });

  it('refuses a new period while another has not started, even one that does not overlap', async () => {
    const later = {
      ...NEXT,
      start_date: day('2027-02-01'),
      end_date: day('2027-03-31'),
    };
    const { tx, service } = setup([CURRENT, later]);

    const { error, body } = await rejection(
      service.create(CREATOR_ID, TERMS, NOW, ADMIN_ID),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(body).toEqual({
      code: 'UPCOMING_PERIOD_EXISTS',
      message:
        'Periode 1 Feb 2027 – 31 Mar 2027 belum dimulai. Ubah atau hapus periode itu dulu sebelum menambah periode baru',
    });
    expect(tx.contracts.create).not.toHaveBeenCalled();
  });

  it('answers a saved period without an invoice row with a null invoice id', async () => {
    const { tx, service } = setup([CURRENT]);
    tx.contracts.create.mockResolvedValue({ ...SAVED, invoice: null });

    await expect(
      service.create(CREATOR_ID, TERMS, NOW, ADMIN_ID),
    ).resolves.toEqual({
      ...RESULT,
      invoiceId: null,
    });
  });
});

describe('ContractPeriodsService.update', () => {
  it('locks the creator and the contract, then regenerates the Evergreen schedule', async () => {
    const { tx, service } = setup([CURRENT, NEXT]);
    const moved = {
      ...TERMS,
      contractStart: day('2026-12-02'),
      deadlines: [day('2026-12-07'), day('2026-12-21')],
    };

    await expect(
      service.update(CREATOR_ID, NEXT_ID, moved, NOW, ADMIN_ID),
    ).resolves.toEqual(RESULT);

    expect(locks(tx)).toEqual([
      {
        sql: expect.stringMatching(/FROM creators .*FOR UPDATE/s),
        values: [CREATOR_ID],
      },
      {
        sql: expect.stringMatching(/FROM contracts .*FOR UPDATE/s),
        values: [NEXT_ID],
      },
    ]);
    expect(tx.contents.deleteMany).toHaveBeenCalledWith({
      where: { contract_id: NEXT_ID, type: 'evergreen' },
    });
    expect(tx.contracts.update).toHaveBeenCalledWith({
      where: { id: NEXT_ID },
      data: {
        start_date: day('2026-12-02'),
        end_date: day('2027-01-31'),
        contract_type: 'regular',
        days_between: 14,
        content_quota: 2,
        fixed_rate: 1_500_000,
        updated_at: NOW,
        contents: {
          create: [
            expect.objectContaining({ name: 'Evg_1_Rangga Pratama_07122026' }),
            expect.objectContaining({ name: 'Evg_2_Rangga Pratama_21122026' }),
          ],
        },
      },
      select: SAVED_SELECT,
    });
    expect(tx.contents.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.contracts.update.mock.invocationCallOrder[0],
    );
  });

  it('does not count the period being edited as an overlap with itself', async () => {
    const { tx, service } = setup([CURRENT, NEXT]);

    await service.update(CREATOR_ID, NEXT_ID, TERMS, NOW, ADMIN_ID);

    expect(tx.contracts.update).toHaveBeenCalled();
  });

  it('answers 404 for a contract of another creator, touching nothing', async () => {
    const { tx, service } = setup([CURRENT]);

    const { error, body } = await rejection(
      service.update(CREATOR_ID, NEXT_ID, TERMS, NOW, ADMIN_ID),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(body).toEqual({
      code: 'PERIOD_NOT_FOUND',
      message: 'Periode tidak ditemukan',
    });
    expect(tx.contents.deleteMany).not.toHaveBeenCalled();
    expect(tx.contracts.update).not.toHaveBeenCalled();
  });

  it('answers 404 for a creator that does not exist', async () => {
    const { error } = await rejection(
      setup(null).service.update(CREATOR_ID, NEXT_ID, TERMS, NOW),
    );

    expect(error).toBeInstanceOf(NotFoundException);
  });

  it('refuses to change a period that has started, on its first day too', async () => {
    const { tx, service } = setup([{ ...NEXT, start_date: day('2026-11-18') }]);

    const { error, body } = await rejection(
      service.update(CREATOR_ID, NEXT_ID, TERMS, NOW, ADMIN_ID),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(body).toEqual({
      code: 'PERIOD_STARTED',
      message: 'Periode sudah dimulai dan tidak bisa diubah',
    });
    expect(tx.contracts.update).not.toHaveBeenCalled();
  });

  it('refuses new dates that overlap another period', async () => {
    const { tx, service } = setup([CURRENT, NEXT]);

    const { body } = await rejection(
      service.update(
        CREATOR_ID,
        NEXT_ID,
        { ...TERMS, contractStart: day('2026-11-30') },
        NOW,
        ADMIN_ID,
      ),
    );

    expect(body.errors).toEqual({
      contractStart:
        'Periode bertabrakan dengan kontrak 1 Jun 2026 – 30 Nov 2026',
    });
    expect(tx.contents.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses new dates that leave Specific content outside the period', async () => {
    const { tx, service } = setup([
      CURRENT,
      { ...NEXT, contents: [{ name: 'Launch', deadline: day('2027-01-20') }] },
    ]);

    const { error, body } = await rejection(
      service.update(
        CREATOR_ID,
        NEXT_ID,
        { ...TERMS, contractEnd: day('2027-01-20') },
        NOW,
        ADMIN_ID,
      ),
    );

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(body).toEqual({
      message: 'Data periode tidak valid',
      errors: {
        contents:
          'Konten "Launch" (deadline 20 Jan 2027) di luar periode baru (6 Des 2026 – 15 Jan 2027); pindahkan atau hapus dulu',
      },
    });
    expect(tx.contents.deleteMany).not.toHaveBeenCalled();
  });

  it('asks only for Specific content of the periods it reads', async () => {
    const { tx, service } = setup([CURRENT, NEXT]);

    await service.update(CREATOR_ID, NEXT_ID, TERMS, NOW, ADMIN_ID);

    expect(tx.creators.findUnique).toHaveBeenCalledWith({
      where: { id: CREATOR_ID },
      select: {
        first_name: true,
        middle_name: true,
        last_name: true,
        contracts: {
          select: {
            id: true,
            start_date: true,
            end_date: true,
            contents: {
              where: { type: 'specific' },
              select: { name: true, deadline: true },
            },
          },
        },
      },
    });
  });
});

describe('ContractPeriodsService.assertEditable', () => {
  it('passes a period that has not started, under the same locks as the edit', async () => {
    const { tx, service } = setup([CURRENT, NEXT]);

    await expect(
      service.assertEditable(CREATOR_ID, NEXT_ID, NOW),
    ).resolves.toBeUndefined();

    expect(locks(tx)).toEqual([
      {
        sql: expect.stringMatching(/FROM creators .*FOR UPDATE/s),
        values: [CREATOR_ID],
      },
      {
        sql: expect.stringMatching(/FROM contracts .*FOR UPDATE/s),
        values: [NEXT_ID],
      },
    ]);
    expect(tx.contracts.update).not.toHaveBeenCalled();
  });

  it('answers a period that has started with PERIOD_STARTED, whatever its new terms would be', async () => {
    const { service } = setup([CURRENT, NEXT]);

    const { error, body } = await rejection(
      service.assertEditable(CREATOR_ID, CURRENT_ID, NOW),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(body).toEqual({
      code: 'PERIOD_STARTED',
      message: 'Periode sudah dimulai dan tidak bisa diubah',
    });
  });

  it('answers 404 for a period of another creator', async () => {
    const { service } = setup([CURRENT]);

    const { error } = await rejection(
      service.assertEditable(CREATOR_ID, NEXT_ID, NOW),
    );

    expect(error).toBeInstanceOf(NotFoundException);
  });
});

describe('ContractPeriodsService.remove', () => {
  it('locks the creator and the contract, then deletes the period with its schedule and invoice', async () => {
    const { tx, service } = setup([CURRENT, NEXT]);

    await expect(
      service.remove(CREATOR_ID, NEXT_ID, NOW),
    ).resolves.toBeUndefined();

    expect(locks(tx)).toEqual([
      {
        sql: expect.stringMatching(/FROM creators .*FOR UPDATE/s),
        values: [CREATOR_ID],
      },
      {
        sql: expect.stringMatching(/FROM contracts .*FOR UPDATE/s),
        values: [NEXT_ID],
      },
    ]);
    expect(tx.contracts.delete).toHaveBeenCalledWith({
      where: { id: NEXT_ID },
    });
  });

  it('answers 404 for a contract of another creator', async () => {
    const { tx, service } = setup([CURRENT]);

    const { error } = await rejection(service.remove(CREATOR_ID, NEXT_ID, NOW));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(tx.contracts.delete).not.toHaveBeenCalled();
  });

  it('answers 404 for a creator that does not exist', async () => {
    const { error } = await rejection(
      setup(null).service.remove(CREATOR_ID, NEXT_ID, NOW),
    );

    expect(error).toBeInstanceOf(NotFoundException);
  });

  it('refuses to delete a period that has started', async () => {
    const { tx, service } = setup([CURRENT, NEXT]);

    const { error, body } = await rejection(
      service.remove(CREATOR_ID, CURRENT_ID, NOW),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(body).toEqual({
      code: 'PERIOD_STARTED',
      message: 'Periode sudah dimulai dan tidak bisa dihapus',
    });
    expect(tx.contracts.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete the creator's only period, so no creator is left without a contract", async () => {
    const { tx, service } = setup([NEXT]);

    const { error, body } = await rejection(
      service.remove(CREATOR_ID, NEXT_ID, NOW),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(body).toEqual({
      code: 'LAST_PERIOD',
      message: 'Periode satu-satunya creator tidak bisa dihapus',
    });
    expect(tx.contracts.delete).not.toHaveBeenCalled();
  });
});
