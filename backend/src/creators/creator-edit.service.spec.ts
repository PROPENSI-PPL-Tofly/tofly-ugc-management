import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PendingCreatorEditAudit, silentCreatorEditNotifier } from './creator-edit-ports.js';
import { CreatorEditService, type CreatorEditClient } from './creator-edit.service.js';
import type { CreatorEdit } from './creator-edit.js';

// 10:00 WIB on 25 November 2026.
const NOW = new Date('2026-11-25T03:00:00Z');
const CREATOR_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const PAST_ID = '22222222-2222-4222-8222-000000000001';
const RUNNING_ID = '22222222-2222-4222-8222-000000000002';
const NEXT_ID = '22222222-2222-4222-8222-000000000003';

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function period(id: string, start: string, end: string, overrides: object = {}) {
  return {
    id,
    start_date: day(start),
    end_date: day(end),
    original_end_date: null,
    contract_type: 'probation',
    content_quota: 6,
    fixed_rate: new Prisma.Decimal(4_000_000),
    invoice: { status: 'running' } as { status: string } | null,
    _count: { contents: 5 },
    ...overrides,
  };
}

const INSTAGRAM = {
  platform: 'instagram',
  username: 'salsa.ig',
  is_connected: false,
  platform_user_id: null as string | null,
  connected_at: null,
};

function creatorRow(overrides: object = {}) {
  return {
    user_id: USER_ID,
    first_name: 'Salsa',
    middle_name: null,
    last_name: 'Amelia',
    users: { email: 'salsa@example.com', is_admin: false },
    social_accounts: [INSTAGRAM],
    contracts: [
      period(PAST_ID, '2026-03-01', '2026-08-31', { invoice: { status: 'paid' } }),
      period(RUNNING_ID, '2026-09-01', '2026-12-15'),
      period(NEXT_ID, '2027-01-01', '2027-03-31'),
    ],
    ...overrides,
  };
}

function running(overrides: object) {
  return creatorRow({ contracts: [period(RUNNING_ID, '2026-09-01', '2026-12-15', overrides)] });
}

function setup(creator: unknown = creatorRow(), linkPlatforms: string[] = []) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    creators: {
      findUnique: vi.fn().mockResolvedValue(creator),
      update: vi.fn().mockResolvedValue({}),
    },
    users: { update: vi.fn().mockResolvedValue({}) },
    app_sessions: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    login_codes: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    social_accounts: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    content_links: {
      findMany: vi.fn().mockResolvedValue(linkPlatforms.map((platform) => ({ platform }))),
    },
    contracts: { update: vi.fn().mockResolvedValue({}) },
    invoices: { upsert: vi.fn().mockResolvedValue({ id: 'invoice-2' }) },
    invoice_rate_changes: { create: vi.fn().mockResolvedValue({}) },
  };
  const committed = vi.fn();
  const prisma = {
    $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => {
      const result = await work(tx);
      committed();
      return result;
    }),
  };
  const audit = { recordBy: vi.fn().mockResolvedValue(undefined) };
  const notifier = {
    contractEndChanged: vi.fn().mockResolvedValue(undefined),
    quotaChanged: vi.fn().mockResolvedValue(undefined),
  };
  const service = new CreatorEditService(
    prisma as unknown as CreatorEditClient,
    audit,
    notifier,
  );
  return { tx, audit, notifier, committed, service };
}

type Setup = ReturnType<typeof setup>;

function edit(overrides: Partial<CreatorEdit> = {}): CreatorEdit {
  return { usernames: {}, terms: {}, ...overrides };
}

function save({ service }: Setup, overrides: Partial<CreatorEdit>, admin: string | undefined = ADMIN_ID) {
  return service.edit(CREATOR_ID, edit(overrides), NOW, admin);
}

function expectNothingWritten({ tx, audit, notifier }: Setup): void {
  for (const write of [
    tx.creators.update,
    tx.users.update,
    tx.app_sessions.deleteMany,
    tx.login_codes.deleteMany,
    tx.social_accounts.createMany,
    tx.social_accounts.updateMany,
    tx.social_accounts.deleteMany,
    tx.contracts.update,
    tx.invoices.upsert,
    tx.invoice_rate_changes.create,
    audit.recordBy,
    notifier.contractEndChanged,
    notifier.quotaChanged,
  ]) {
    expect(write).not.toHaveBeenCalled();
  }
}

async function refusal(work: Promise<unknown>): Promise<{ status: number; body: unknown }> {
  const error = await work.then(
    () => {
      throw new Error('expected a rejection');
    },
    (caught: unknown) => caught,
  );
  const http = error as { getStatus(): number; getResponse(): unknown };
  return { status: http.getStatus(), body: http.getResponse() };
}

describe('CreatorEditService.edit', () => {
  // OWASP A04: the creator, then their contracts in one order, so an edit, a Finalize, a link
  // hand-in and an early end never read a period another is changing.
  it('locks the creator and then their contracts before reading them', async () => {
    const s = setup();
    await save(s, { name: { first_name: 'Salsa', middle_name: null, last_name: 'Putri' } });

    const locks = s.tx.$queryRaw.mock.calls.map((call: unknown[]) => {
      const query = call[0] as Prisma.Sql;
      return { sql: query.sql, values: query.values };
    });
    expect(locks).toEqual([
      { sql: 'SELECT id FROM creators WHERE id = ?::uuid FOR UPDATE', values: [CREATOR_ID] },
      {
        sql: 'SELECT id FROM contracts WHERE creator_id = ?::uuid ORDER BY id FOR UPDATE',
        values: [CREATOR_ID],
      },
    ]);
    expect(s.tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      s.tx.creators.findUnique.mock.invocationCallOrder[0],
    );
  });

  // The stub answers every column whatever is selected, so the select is pinned: without is_admin
  // an admin account's address could be changed here (OWASP A01).
  it('reads the named creator with everything the rules judge', async () => {
    const s = setup();
    await save(s, {});

    expect(s.tx.creators.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { id: CREATOR_ID },
      select: {
        user_id: true,
        first_name: true,
        middle_name: true,
        last_name: true,
        users: { select: { email: true, is_admin: true } },
        social_accounts: {
          select: {
            platform: true,
            username: true,
            is_connected: true,
            platform_user_id: true,
            connected_at: true,
          },
        },
        contracts: {
          orderBy: { start_date: 'asc' },
          select: {
            id: true,
            start_date: true,
            end_date: true,
            original_end_date: true,
            contract_type: true,
            content_quota: true,
            fixed_rate: true,
            invoice: { select: { status: true } },
            _count: { select: { contents: { where: { type: 'evergreen' } } } },
          },
        },
      },
    });
  });

  it('answers 404 for a creator that does not exist', async () => {
    const s = setup(null);
    await expect(save(s, { email: 'x@example.com' })).rejects.toBeInstanceOf(NotFoundException);
    expect(await refusal(save(s, {}))).toEqual({
      status: 404,
      body: { code: 'CREATOR_NOT_FOUND', message: 'Creator tidak ditemukan' },
    });
  });

  // OWASP A01: another creator's contract reads like one that does not exist.
  it('answers 404 for a contract that is not this creator’s', async () => {
    const s = setup();
    expect(await refusal(save(s, { contractId: ADMIN_ID, terms: { quota: 7 } }))).toEqual({
      status: 404,
      body: { code: 'PERIOD_NOT_FOUND', message: 'Periode tidak ditemukan' },
    });
    expectNothingWritten(s);
  });

  it('writes and records nothing when every value is the one stored', async () => {
    const s = setup();
    await expect(
      save(s, {
        name: { first_name: 'Salsa', middle_name: null, last_name: 'Amelia' },
        email: 'SALSA@example.com',
        usernames: { instagram: 'salsa.ig', tiktok: '' },
        contractId: RUNNING_ID,
        terms: {
          contractType: 'probation',
          fixedRate: 4_000_000,
          quota: 6,
          contractEnd: day('2026-12-15'),
        },
      }),
    ).resolves.toEqual({ id: CREATOR_ID, changed: [] });
    expectNothingWritten(s);
  });

  // A value the form sends back unchanged is not an edit, so a lock on it refuses nothing.
  it('lets locked fields through when they are sent back as they were', async () => {
    const s = setup(
      creatorRow({
        social_accounts: [{ ...INSTAGRAM, is_connected: true, platform_user_id: 'ig-1' }],
      }),
    );
    await expect(
      save(s, {
        usernames: { instagram: 'salsa.ig' },
        contractId: PAST_ID,
        terms: { fixedRate: 4_000_000, quota: 6, contractEnd: day('2026-08-31'), contractType: 'regular' },
      }),
    ).resolves.toEqual({ id: CREATOR_ID, changed: ['contractType'] });
  });

  describe('name', () => {
    it('saves it and records the old and new name', async () => {
      const s = setup();
      const name = { first_name: 'Salsa', middle_name: 'Putri', last_name: 'Amelia' };
      await expect(save(s, { name })).resolves.toEqual({ id: CREATOR_ID, changed: ['name'] });

      expect(s.tx.creators.update).toHaveBeenCalledExactlyOnceWith({
        where: { id: CREATOR_ID },
        data: { ...name, updated_at: NOW },
      });
      expect(s.audit.recordBy).toHaveBeenCalledExactlyOnceWith(s.tx, ADMIN_ID, {
        action: 'creator_changed',
        target: { id: CREATOR_ID, label: 'Salsa Putri Amelia' },
        creatorId: CREATOR_ID,
        oldValues: { name: 'Salsa Amelia' },
        newValues: { name: 'Salsa Putri Amelia' },
      });
      expect(s.tx.app_sessions.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('email', () => {
    // OWASP A07: whoever held the old address is out, and a code it was sent signs nobody in.
    it('whitelists the new address, ends every session and drops unused codes', async () => {
      const s = setup();
      await expect(save(s, { email: 'Baru@example.com' })).resolves.toEqual({
        id: CREATOR_ID,
        changed: ['email'],
      });

      expect(s.tx.users.update).toHaveBeenCalledExactlyOnceWith({
        where: { id: USER_ID },
        data: { email: 'Baru@example.com', updated_at: NOW },
      });
      expect(s.tx.app_sessions.deleteMany).toHaveBeenCalledExactlyOnceWith({
        where: { userId: USER_ID },
      });
      expect(s.tx.login_codes.deleteMany).toHaveBeenCalledExactlyOnceWith({
        where: { email: { in: ['salsa@example.com', 'baru@example.com'] } },
      });
      expect(s.audit.recordBy).toHaveBeenCalledExactlyOnceWith(
        s.tx,
        ADMIN_ID,
        expect.objectContaining({
          oldValues: { email: 'salsa@example.com' },
          newValues: { email: 'Baru@example.com' },
        }),
      );
      expect(s.tx.creators.update).not.toHaveBeenCalled();
    });

    it('answers an address already taken under the email field', async () => {
      const s = setup();
      s.tx.users.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('taken', { code: 'P2002', clientVersion: 'x' }),
      );
      expect(await refusal(save(s, { email: 'taken@example.com' }))).toEqual({
        status: 422,
        body: {
          message: 'Data creator tidak valid',
          errors: { email: 'Email sudah terdaftar' },
        },
      });
      expect(s.tx.app_sessions.deleteMany).not.toHaveBeenCalled();
      expect(s.committed).not.toHaveBeenCalled();
    });

    it.each([
      new Error('connection lost'),
      new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'x' }),
    ])('passes any other failure on: %s', async (failure) => {
      const s = setup();
      s.tx.users.update.mockRejectedValue(failure);
      await expect(save(s, { email: 'baru@example.com' })).rejects.toBe(failure);
    });

    // OWASP A01: an Admin must not take over an admin account by editing the creator behind it.
    it('refuses to change the address of an account that is also an Admin', async () => {
      const s = setup(creatorRow({ users: { email: 'salsa@example.com', is_admin: true } }));
      expect(await refusal(save(s, { email: 'baru@example.com' }))).toEqual({
        status: 422,
        body: {
          message: 'Data creator tidak valid',
          errors: { email: 'Email akun Admin tidak bisa diubah dari sini' },
        },
      });
      expectNothingWritten(s);
    });
  });

  describe('usernames', () => {
    const NOT_CONNECTED = {
      NOT: { is_connected: true, platform_user_id: { not: null } },
    };

    it('changes one that is on file', async () => {
      const s = setup();
      await save(s, { usernames: { instagram: 'salsa.baru' } });

      expect(s.tx.social_accounts.updateMany).toHaveBeenCalledExactlyOnceWith({
        where: { creator_id: CREATOR_ID, platform: 'instagram', ...NOT_CONNECTED },
        data: { username: 'salsa.baru', updated_at: NOW },
      });
      expect(s.audit.recordBy).toHaveBeenCalledExactlyOnceWith(
        s.tx,
        ADMIN_ID,
        expect.objectContaining({
          oldValues: { instagramUsername: 'salsa.ig' },
          newValues: { instagramUsername: 'salsa.baru' },
        }),
      );
    });

    it('adds one that was not', async () => {
      const s = setup();
      await expect(save(s, { usernames: { tiktok: 'salsa.tt' } })).resolves.toEqual({
        id: CREATOR_ID,
        changed: ['tiktokUsername'],
      });

      expect(s.tx.social_accounts.createMany).toHaveBeenCalledExactlyOnceWith({
        data: [{ creator_id: CREATOR_ID, platform: 'tiktok', username: 'salsa.tt' }],
        skipDuplicates: true,
      });
      expect(s.audit.recordBy).toHaveBeenCalledExactlyOnceWith(
        s.tx,
        ADMIN_ID,
        expect.objectContaining({
          oldValues: { tiktokUsername: null },
          newValues: { tiktokUsername: 'salsa.tt' },
        }),
      );
    });

    it('clears one', async () => {
      const s = setup();
      await save(s, { usernames: { instagram: '' } });

      expect(s.tx.social_accounts.deleteMany).toHaveBeenCalledExactlyOnceWith({
        where: { creator_id: CREATOR_ID, platform: 'instagram', ...NOT_CONNECTED },
      });
      expect(s.audit.recordBy).toHaveBeenCalledExactlyOnceWith(
        s.tx,
        ADMIN_ID,
        expect.objectContaining({ newValues: { instagramUsername: null } }),
      );
    });

    it('refuses one whose account is connected', async () => {
      const s = setup(
        creatorRow({
          social_accounts: [{ ...INSTAGRAM, is_connected: true, platform_user_id: 'ig-1' }],
        }),
      );
      expect(await refusal(save(s, { usernames: { instagram: 'x' } }))).toEqual({
        status: 409,
        body: {
          code: 'USERNAME_LOCKED',
          message: 'Username Instagram mengikuti akun yang terhubung',
        },
      });
      expectNothingWritten(s);
    });

    it('refuses one with a link submitted on its platform, in any of the creator’s periods', async () => {
      const s = setup(creatorRow(), ['tiktok']);
      expect(await refusal(save(s, { usernames: { tiktok: 'x' } }))).toMatchObject({
        status: 409,
        body: { code: 'USERNAME_LOCKED' },
      });
      expect(s.tx.content_links.findMany).toHaveBeenCalledExactlyOnceWith({
        where: {
          platform: { not: null },
          contents: { contracts: { creator_id: CREATOR_ID } },
        },
        distinct: ['platform'],
        select: { platform: true },
      });
      expectNothingWritten(s);
    });

    // Each platform is judged by its own account.
    it('changes TikTok while Instagram is connected', async () => {
      const s = setup(
        creatorRow({
          social_accounts: [
            { ...INSTAGRAM, is_connected: true, platform_user_id: 'ig-1' },
            { ...INSTAGRAM, platform: 'tiktok', username: 'salsa.tt' },
          ],
        }),
      );
      await expect(save(s, { usernames: { tiktok: 'x' } })).resolves.toMatchObject({
        changed: ['tiktokUsername'],
      });
    });

    it('lets an Admin’s creator change anything but the address', async () => {
      const s = setup(creatorRow({ users: { email: 'salsa@example.com', is_admin: true } }));
      await expect(save(s, { usernames: { instagram: 'x' } })).resolves.toMatchObject({
        changed: ['instagramUsername'],
      });
    });

    it('leaves the other platform’s username editable', async () => {
      const s = setup(creatorRow(), ['tiktok']);
      await expect(save(s, { usernames: { instagram: 'x' } })).resolves.toMatchObject({
        changed: ['instagramUsername'],
      });
    });

    it('does not read the links when no username changes', async () => {
      const s = setup();
      await save(s, { email: 'baru@example.com' });
      expect(s.tx.content_links.findMany).not.toHaveBeenCalled();
    });

    // OWASP A04: the creator connects between the read and the write; the platform's name wins.
    it.each([
      ['updateMany', { instagram: 'x' }],
      ['deleteMany', { instagram: '' }],
      ['createMany', { tiktok: 'x' }],
    ] as const)('refuses when %s finds the account connected meanwhile', async (write, usernames) => {
      const s = setup();
      s.tx.social_accounts[write].mockResolvedValue({ count: 0 });
      const work = save(s, { usernames });
      await expect(work).rejects.toBeInstanceOf(ConflictException);
      expect(await refusal(work)).toMatchObject({
        body: {
          code: 'USERNAME_LOCKED',
          message: expect.stringContaining('mengikuti akun yang terhubung'),
        },
      });
      expect(s.committed).not.toHaveBeenCalled();
    });
  });

  describe('contract type', () => {
    it.each([
      ['an ended', PAST_ID, 'Salsa Amelia · Periode 1'],
      ['an active', RUNNING_ID, 'Salsa Amelia · Periode 2'],
      ['an upcoming', NEXT_ID, 'Salsa Amelia · Periode 3'],
    ])('changes on %s period', async (_label, contractId, label) => {
      const s = setup();
      await save(s, { contractId, terms: { contractType: 'regular' } });

      expect(s.tx.contracts.update).toHaveBeenCalledExactlyOnceWith({
        where: { id: contractId },
        data: { contract_type: 'regular', updated_at: NOW },
      });
      expect(s.audit.recordBy).toHaveBeenCalledExactlyOnceWith(s.tx, ADMIN_ID, {
        action: 'period_changed',
        target: { id: contractId, label },
        creatorId: CREATOR_ID,
        oldValues: { contractType: 'probation' },
        newValues: { contractType: 'regular' },
      });
    });
  });

  describe('fixed rate', () => {
    const CHANGE = { contractId: RUNNING_ID, terms: { fixedRate: 4_500_000 } };

    it('saves it and adds it to the invoice’s history', async () => {
      const s = setup();
      await expect(save(s, CHANGE)).resolves.toEqual({ id: CREATOR_ID, changed: ['fixedRate'] });

      expect(s.tx.contracts.update).toHaveBeenCalledExactlyOnceWith({
        where: { id: RUNNING_ID },
        data: { fixed_rate: 4_500_000, updated_at: NOW },
      });
      expect(s.tx.invoices.upsert).toHaveBeenCalledExactlyOnceWith({
        where: { contract_id: RUNNING_ID },
        create: { contract_id: RUNNING_ID },
        update: {},
        select: { id: true },
      });
      expect(s.tx.invoice_rate_changes.create).toHaveBeenCalledExactlyOnceWith({
        data: {
          invoice_id: 'invoice-2',
          old_rate: 4_000_000,
          new_rate: 4_500_000,
          actor_user_id: ADMIN_ID,
          created_at: NOW,
        },
      });
      expect(s.audit.recordBy).toHaveBeenCalledExactlyOnceWith(
        s.tx,
        ADMIN_ID,
        expect.objectContaining({
          action: 'period_changed',
          oldValues: { fixedRate: 4_000_000 },
          newValues: { fixedRate: 4_500_000 },
        }),
      );
    });

    it('records no actor behind the local stand-in', async () => {
      const s = setup();
      await s.service.edit(CREATOR_ID, edit(CHANGE), NOW);
      expect(s.tx.invoice_rate_changes.create.mock.calls[0][0].data.actor_user_id).toBeNull();
      expect(s.audit.recordBy).toHaveBeenCalledWith(s.tx, undefined, expect.anything());
    });

    it('treats a contract without an invoice row as running', async () => {
      const s = setup(running({ invoice: null }));
      await expect(save(s, CHANGE)).resolves.toMatchObject({ changed: ['fixedRate'] });
    });

    it('changes on an ended period whose invoice still runs', async () => {
      const s = setup(running({ end_date: day('2026-11-01') }));
      await expect(save(s, CHANGE)).resolves.toMatchObject({ changed: ['fixedRate'] });
    });

    it.each(['finalized', 'creator_acked', 'payment_uploaded', 'paid', 'cancelled'])(
      'is refused once the invoice is %s',
      async (status) => {
        const s = setup(running({ invoice: { status } }));
        expect(await refusal(save(s, CHANGE))).toMatchObject({
          status: 409,
          body: { code: 'FIXED_RATE_LOCKED' },
        });
        expectNothingWritten(s);
      },
    );
  });

  describe('end date and quota', () => {
    const CHANGE = {
      contractId: RUNNING_ID,
      terms: { contractEnd: day('2026-12-31'), quota: 8 },
    };

    it('saves both, records them and emails the creator only once saved', async () => {
      const s = setup();
      await expect(save(s, CHANGE)).resolves.toEqual({
        id: CREATOR_ID,
        changed: ['contractEnd', 'quota'],
      });

      expect(s.tx.contracts.update).toHaveBeenCalledExactlyOnceWith({
        where: { id: RUNNING_ID },
        data: { end_date: day('2026-12-31'), content_quota: 8, updated_at: NOW },
      });
      expect(s.audit.recordBy).toHaveBeenCalledExactlyOnceWith(
        s.tx,
        ADMIN_ID,
        expect.objectContaining({
          action: 'period_changed',
          oldValues: { contractEnd: '2026-12-15', quota: 6 },
          newValues: { contractEnd: '2026-12-31', quota: 8 },
        }),
      );
      expect(s.notifier.contractEndChanged).toHaveBeenCalledExactlyOnceWith({
        creatorId: CREATOR_ID,
        contractId: RUNNING_ID,
        endDate: '2026-12-31',
      });
      expect(s.notifier.quotaChanged).toHaveBeenCalledExactlyOnceWith({
        creatorId: CREATOR_ID,
        contractId: RUNNING_ID,
        quota: 8,
      });
      expect(s.committed.mock.invocationCallOrder[0]).toBeLessThan(
        s.notifier.contractEndChanged.mock.invocationCallOrder[0],
      );
      // The rate and the invoice's history stay as they were.
      expect(s.tx.invoice_rate_changes.create).not.toHaveBeenCalled();
    });

    it('emails only about what changed', async () => {
      const s = setup();
      await save(s, { contractId: RUNNING_ID, terms: { quota: 5 } });
      expect(s.notifier.contractEndChanged).not.toHaveBeenCalled();
      expect(s.notifier.quotaChanged).toHaveBeenCalledOnce();

      const other = setup();
      await save(other, { contractId: RUNNING_ID, terms: { contractEnd: day('2026-12-16') } });
      expect(other.notifier.contractEndChanged).toHaveBeenCalledOnce();
      expect(other.notifier.quotaChanged).not.toHaveBeenCalled();
    });

    it.each([
      [PAST_ID, { quota: 9 }],
      [PAST_ID, { contractEnd: day('2026-12-01') }],
      [NEXT_ID, { quota: 9 }],
      [NEXT_ID, { contractEnd: day('2027-12-01') }],
    ])('is refused on a period that is not active (%s, %j)', async (contractId, terms) => {
      const s = setup();
      expect(await refusal(save(s, { contractId, terms }))).toMatchObject({
        status: 409,
        body: { code: 'PERIOD_NOT_ACTIVE' },
      });
      expectNothingWritten(s);
    });

    it('names both problems under their fields', async () => {
      const s = setup();
      expect(
        await refusal(
          save(s, {
            contractId: RUNNING_ID,
            terms: { contractEnd: day('2027-01-01'), quota: 4 },
          }),
        ),
      ).toEqual({
        status: 422,
        body: {
          message: 'Data creator tidak valid',
          errors: {
            contractEnd: 'Paling lambat 31 Des 2026, sehari sebelum Periode 3 mulai',
            quota: 'Minimal 5, sesuai konten Evergreen yang sudah ada',
          },
        },
      });
      expectNothingWritten(s);
    });
  });

  it('records identity and period apart when both change, under the new name', async () => {
    const s = setup();
    await save(s, {
      name: { first_name: 'Rani', middle_name: null, last_name: null },
      contractId: RUNNING_ID,
      terms: { contractType: 'regular' },
    });
    expect(s.audit.recordBy.mock.calls.map((call) => [call[2].action, call[2].target.label])).toEqual([
      ['creator_changed', 'Rani'],
      ['period_changed', 'Rani · Periode 2'],
    ]);
  });

  // OWASP A09: an edit that cannot be recorded is not saved.
  it('fails with the audit log', async () => {
    const s = setup();
    s.audit.recordBy.mockRejectedValue(new Error('audit down'));
    await expect(save(s, { contractId: RUNNING_ID, terms: { quota: 8 } })).rejects.toThrow('audit down');
    expect(s.committed).not.toHaveBeenCalled();
    expect(s.notifier.quotaChanged).not.toHaveBeenCalled();
  });
});

describe('the stand-ins until the audit log and the emails are merged', () => {
  it('record and send nothing', async () => {
    await expect(
      new PendingCreatorEditAudit().recordBy({}, null, {
        action: 'creator_changed',
        target: { label: 'x' },
      }),
    ).resolves.toBeUndefined();
    await expect(
      silentCreatorEditNotifier.contractEndChanged({ creatorId: 'a', contractId: 'b', endDate: 'c' }),
    ).resolves.toBeUndefined();
    await expect(
      silentCreatorEditNotifier.quotaChanged({ creatorId: 'a', contractId: 'b', quota: 1 }),
    ).resolves.toBeUndefined();
  });
});
