import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  MyProposalsService,
  type ProposalsClient,
} from './my-proposals.service.js';
import type { NewProposal } from './my-proposal.js';

const CREATOR = '5b0c8a4e-2f1d-4c3b-9a8e-7d6f5e4c3b2a';
const CONTRACT = '22222222-2222-4222-8222-222222222222';
const CONTENT = '33333333-3333-4333-8333-333333333333';
// 10:00 WIB on 21 November 2026.
const NOW = new Date('2026-11-21T03:00:00Z');

const INPUT: NewProposal = {
  name: 'Unboxing Paket Besar',
  brief: 'Tunjukkan proses kirim paket besar.',
  deadline: '2026-12-20',
  notes: 'Pakai produk di rumah.',
};

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

const ACTIVE = { id: CONTRACT, start_date: day('2026-06-01'), end_date: day('2027-01-31') };

function setup(options: { contract?: unknown; buffer?: number } = {}) {
  const contract = 'contract' in options ? options.contract : ACTIVE;
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    contracts: { findFirst: vi.fn().mockResolvedValue(contract) },
    creators: {
      findUnique: vi.fn().mockResolvedValue({ first_name: 'Rani', middle_name: null, last_name: 'Kusuma' }),
    },
    contents: {
      create: vi.fn().mockResolvedValue({
        id: CONTENT,
        name: INPUT.name,
        brief: INPUT.brief,
        deadline: day(INPUT.deadline),
        proposal_notes: INPUT.notes,
        status: 'pending',
        type: 'specific',
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn(),
    },
    content_events: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const scheduling = { today: () => NOW, bufferDays: vi.fn().mockResolvedValue(options.buffer ?? 5) };
  const service = new MyProposalsService(prisma as unknown as ProposalsClient, scheduling);
  return { tx, prisma, scheduling, service };
}

async function refusal(work: Promise<unknown>): Promise<{ error: unknown; body: Record<string, unknown> }> {
  const error = await work.then(
    () => expect.unreachable('expected a refusal'),
    (reason: unknown) => reason,
  );
  return { error, body: (error as { getResponse(): Record<string, unknown> }).getResponse() };
}

describe('MyProposalsService.create', () => {
  it("saves the proposal as a pending Specific content on the creator's active contract", async () => {
    const { tx, service } = setup();

    const created = await service.create(CREATOR, INPUT);

    expect(tx.contents.create).toHaveBeenCalledWith({
      data: {
        contract_id: CONTRACT,
        type: 'specific',
        name: INPUT.name,
        brief: INPUT.brief,
        deadline: day('2026-12-20'),
        status: 'pending',
        proposal_notes: 'Pakai produk di rumah.',
      },
    });
    expect(created).toEqual({
      id: CONTENT,
      name: INPUT.name,
      type: 'specific',
      brief: INPUT.brief,
      notes: 'Pakai produk di rumah.',
      deadline: '2026-12-20',
      status: 'pending',
    });
  });

  it('keeps no notes when the creator wrote none', async () => {
    const { tx, service } = setup();
    tx.contents.create.mockResolvedValue({
      id: CONTENT, name: INPUT.name, brief: INPUT.brief, deadline: day(INPUT.deadline), proposal_notes: null,
    });

    const created = await service.create(CREATOR, { ...INPUT, notes: null });

    expect(tx.contents.create.mock.calls[0][0].data.proposal_notes).toBeNull();
    expect(created.notes).toBeNull();
  });

  // AC: "a timeline event for each". The step is the content's first, the creator's own, the
  // same "Scheduled" step the panel already words "Diajukan kreator" when a creator made it.
  it("writes the content's first step as the creator's, in the same transaction", async () => {
    const { tx, prisma, service } = setup();

    await service.create(CREATOR, INPUT);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.content_events.create).toHaveBeenCalledWith({
      data: {
        content_id: CONTENT,
        event_type: 'Scheduled',
        actor_name: 'Rani Kusuma',
        actor_role: 'creator',
        occurred_at: NOW,
        event_data: {},
      },
    });
  });

  it('finds the contract that is running today in Jakarta: started, and not yet ended', async () => {
    const { tx, service } = setup();

    await service.create(CREATOR, INPUT);

    expect(tx.contracts.findFirst).toHaveBeenCalledWith({
      where: {
        creator_id: CREATOR,
        start_date: { lte: day('2026-11-21') },
        end_date: { gte: day('2026-11-21') },
      },
      select: { id: true, start_date: true, end_date: true },
      orderBy: { start_date: 'desc' },
    });
  });

  it('locks the contract before judging the deadline, so an end moved meanwhile is the one it reads', async () => {
    const { tx, service } = setup();

    await service.create(CREATOR, INPUT);

    const lock = tx.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(lock.sql).toContain('FROM contracts');
    expect(lock.values).toEqual([CONTRACT]);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.contents.create.mock.invocationCallOrder[0]);
    // Read twice: once to know which contract, once under its lock.
    expect(tx.contracts.findFirst).toHaveBeenCalledTimes(2);
  });

  // OWASP Top 10:2025 A01 (Broken Access Control), AC 3.
  it.each([
    ['has no contract at all', null],
  ])('refuses a creator who %s with 403, saving nothing', async (_label, contract) => {
    const { tx, service } = setup({ contract });

    const { error, body } = await refusal(service.create(CREATOR, INPUT));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(body).toEqual({
      code: 'NO_ACTIVE_CONTRACT',
      message: 'Pengajuan konten hanya bisa dilakukan selama kontrak aktif',
    });
    expect(tx.contents.create).not.toHaveBeenCalled();
    expect(tx.content_events.create).not.toHaveBeenCalled();
  });

  it('refuses when the contract stopped being active between the two reads', async () => {
    const { tx, service } = setup();
    tx.contracts.findFirst.mockResolvedValueOnce(ACTIVE).mockResolvedValueOnce(null);

    await expect(service.create(CREATOR, INPUT)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.contents.create).not.toHaveBeenCalled();
  });

  it.each([
    ['before the window', '2026-11-25', 'Deadline paling cepat 26 Nov 2026'],
    ['after the H-5 line', '2027-01-27', 'Deadline paling lambat 26 Jan 2027 (H-5 akhir kontrak)'],
  ])('refuses a deadline %s under its own field, saving nothing', async (_label, deadline, message) => {
    const { tx, service } = setup();

    const { error, body } = await refusal(service.create(CREATOR, { ...INPUT, deadline }));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(body).toEqual({ message: 'Data pengajuan tidak valid', errors: { deadline: message } });
    expect(tx.contents.create).not.toHaveBeenCalled();
  });

  it('draws the window with the stored buffer', async () => {
    const { service } = setup({ buffer: 2 });

    await expect(service.create(CREATOR, { ...INPUT, deadline: '2026-11-23' })).resolves.toBeDefined();
    const narrow = setup({ buffer: 14 });
    await expect(narrow.service.create(CREATOR, { ...INPUT, deadline: '2026-11-23' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('takes the first day of the window and the last', async () => {
    const { service } = setup();

    await expect(service.create(CREATOR, { ...INPUT, deadline: '2026-11-26' })).resolves.toBeDefined();
    await expect(service.create(CREATOR, { ...INPUT, deadline: '2027-01-26' })).resolves.toBeDefined();
  });

  it('answers 404 when the creator record is gone', async () => {
    const { tx, service } = setup();
    tx.creators.findUnique.mockResolvedValue(null);

    await expect(service.create(CREATOR, INPUT)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.content_events.create).not.toHaveBeenCalled();
  });

  it('falls back to the clock and the default buffer when no scheduling is given', async () => {
    const { tx } = setup();
    const prisma = { $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) };
    const service = new MyProposalsService(prisma as unknown as ProposalsClient);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      await expect(service.create(CREATOR, { ...INPUT, deadline: '2026-11-26' })).resolves.toBeDefined();
      await expect(service.create(CREATOR, { ...INPUT, deadline: '2026-11-25' })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('MyProposalsService.cancel', () => {
  it("withdraws the creator's own pending proposal, in one guarded statement", async () => {
    const { tx, service } = setup();

    await expect(service.cancel(CREATOR, CONTENT)).resolves.toEqual({ id: CONTENT, removed: true });

    // Guarded on the owner and on the status, so an approval made meanwhile is never overwritten.
    expect(tx.contents.deleteMany).toHaveBeenCalledWith({
      where: { id: CONTENT, status: 'pending', contracts: { creator_id: CREATOR } },
    });
    expect(tx.contents.findFirst).not.toHaveBeenCalled();
  });

  it('answers 404 for a content that is not theirs or does not exist, never saying which', async () => {
    const { tx, service } = setup();
    tx.contents.deleteMany.mockResolvedValue({ count: 0 });
    tx.contents.findFirst.mockResolvedValue(null);

    const { error, body } = await refusal(service.cancel(CREATOR, CONTENT));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(body).toEqual({ code: 'CONTENT_NOT_FOUND', message: 'Konten tidak ditemukan' });
    expect(tx.contents.findFirst).toHaveBeenCalledWith({
      where: { id: CONTENT, contracts: { creator_id: CREATOR } },
      select: { status: true },
    });
  });

  // An approval, or the H-1 scheduling, got there first: it is no longer a proposal.
  it.each(['scheduled', 'draft_review', 'link_submitted'])(
    'answers 409 once the content is %s, and removes nothing',
    async (status) => {
      const { tx, service } = setup();
      tx.contents.deleteMany.mockResolvedValue({ count: 0 });
      tx.contents.findFirst.mockResolvedValue({ status });

      const { error, body } = await refusal(service.cancel(CREATOR, CONTENT));

      expect(error).toBeInstanceOf(ConflictException);
      expect(body).toEqual({
        code: 'PROPOSAL_NOT_PENDING',
        message: 'Pengajuan ini sudah tidak menunggu keputusan',
      });
    },
  );
});
