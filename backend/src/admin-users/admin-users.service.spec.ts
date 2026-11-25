import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminUsersService } from './admin-users.service.js';

// SCRUM-246 (PBI-23): the "Pengguna Admin" list and its add, rename and reactivate actions, each
// recorded in "Log Aktivitas" on its own transaction (OWASP A09:2025).

const ACTOR = 'user-super';
const CREATED = new Date('2026-11-01T03:00:00.000Z');
const SIGNED_IN = new Date('2026-11-20T09:30:00.000Z');

const ROW = {
  id: 'user-sinta',
  name: 'Sinta Dewi',
  email: 'sinta@tofly.id',
  is_admin: true,
  admin_role: 'admin' as const,
  is_active: true,
  last_signed_in_at: SIGNED_IN,
  created_at: CREATED,
};

const DTO = {
  id: 'user-sinta',
  name: 'Sinta Dewi',
  email: 'sinta@tofly.id',
  role: 'admin',
  status: 'active',
  lastSignedInAt: '2026-11-20T09:30:00.000Z',
  createdAt: '2026-11-01T03:00:00.000Z',
  isSelf: false,
};

const ACTOR_ROW = { name: 'Gunta', email: 'gunta@tofly.id', admin_role: 'super_admin' };

function setup() {
  const users = {
    findMany: vi.fn().mockResolvedValue([ROW]),
    count: vi.fn().mockResolvedValue(1),
    groupBy: vi.fn().mockResolvedValue([{ is_active: true, _count: { _all: 1 } }]),
    findUnique: vi.fn(),
    create: vi.fn().mockResolvedValue(ROW),
    update: vi.fn(),
  };
  // The actor is read through users.findUnique as well; answer it apart from the target.
  users.findUnique.mockImplementation(
    (args: { where: { id?: string; email?: string } }) =>
      Promise.resolve(args.where.id === ACTOR ? ACTOR_ROW : null),
  );
  const tx = {
    users,
    audit_logs: { create: vi.fn().mockResolvedValue({}) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const prisma = {
    users,
    $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const service = new AdminUsersService(prisma as never);
  return { prisma, tx, users, service };
}

/** The target row the transaction reads, alongside the actor. */
function targetIs(users: ReturnType<typeof setup>['users'], row: unknown) {
  users.findUnique.mockImplementation(
    (args: { where: { id?: string; email?: string } }) =>
      Promise.resolve(args.where.id === ACTOR ? ACTOR_ROW : row),
  );
}

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a refusal');
    },
    (error: unknown) => error,
  );
}

describe('AdminUsersService.list', () => {
  it('answers one page of Admins, active first, then by name, then by email', async () => {
    const { users, service } = setup();
    users.groupBy.mockResolvedValue([
      { is_active: true, _count: { _all: 9 } },
      { is_active: false, _count: { _all: 2 } },
    ]);

    const result = await service.list({ page: 2, pageSize: 10 }, undefined, ACTOR);

    expect(users.findMany).toHaveBeenCalledWith({
      where: { is_admin: true },
      orderBy: [
        { is_active: 'desc' },
        { name: { sort: 'asc', nulls: 'last' } },
        { email: 'asc' },
      ],
      skip: 10,
      take: 10,
      select: {
        id: true,
        name: true,
        email: true,
        admin_role: true,
        is_active: true,
        last_signed_in_at: true,
        created_at: true,
      },
    });
    expect(result).toEqual({
      items: [DTO],
      page: 2,
      pageSize: 10,
      total: 11,
      totalPages: 2,
      activeCount: 9,
      inactiveCount: 2,
    });
  });

  it('counts the whole team for the header in one grouped query, whatever the search', async () => {
    const { users, service } = setup();

    await service.list({ page: 1, pageSize: 10 }, 'sinta', ACTOR);

    expect(users.groupBy).toHaveBeenCalledTimes(1);
    expect(users.groupBy).toHaveBeenCalledWith({
      by: ['is_active'],
      where: { is_admin: true },
      _count: { _all: true },
    });
    expect(users.count).toHaveBeenCalledTimes(1);
  });

  it('takes the total from the grouped counts with no search, with no count query of its own', async () => {
    const { users, service } = setup();
    users.groupBy.mockResolvedValue([{ is_active: true, _count: { _all: 4 } }]);

    const result = await service.list({ page: 1, pageSize: 10 }, undefined, ACTOR);

    expect(users.count).not.toHaveBeenCalled();
    // No inactive Admin means no group for them, which is a count of zero.
    expect(result).toMatchObject({ total: 4, totalPages: 1, activeCount: 4, inactiveCount: 0 });
  });

  it('searches the name and the email, ignoring case', async () => {
    const { users, service } = setup();

    await service.list({ page: 1, pageSize: 10 }, 'Sinta', ACTOR);

    const where = {
      is_admin: true,
      OR: [
        { name: { contains: 'Sinta', mode: 'insensitive' } },
        { email: { contains: 'Sinta', mode: 'insensitive' } },
      ],
    };
    expect(users.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(users.count).toHaveBeenCalledWith({ where });
  });

  // Prisma passes "contains" to ILIKE as it is, so a typed "_" or "%" would match anything.
  it('searches for a typed _, % or \\ as that character, not a wildcard', async () => {
    const { users, service } = setup();

    await service.list({ page: 1, pageSize: 10 }, 'a_b%c\\d', ACTOR);

    expect(users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          is_admin: true,
          OR: [
            { name: { contains: 'a\\_b\\%c\\\\d', mode: 'insensitive' } },
            { email: { contains: 'a\\_b\\%c\\\\d', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('marks the signed-in Super Admin, an inactive Admin, and one who never signed in', async () => {
    const { users, service } = setup();
    users.findMany.mockResolvedValue([
      { ...ROW, id: ACTOR, admin_role: 'super_admin' },
      { ...ROW, id: 'user-old', name: null, is_active: false, last_signed_in_at: null },
    ]);

    const { items } = await service.list({ page: 1, pageSize: 10 }, undefined, ACTOR);

    expect(items).toEqual([
      { ...DTO, id: ACTOR, role: 'super_admin', isSelf: true },
      { ...DTO, id: 'user-old', name: null, status: 'inactive', lastSignedInAt: null },
    ]);
  });

  it('answers zero pages for an empty result', async () => {
    const { users, service } = setup();
    users.findMany.mockResolvedValue([]);
    users.count.mockResolvedValue(0);

    await expect(
      service.list({ page: 1, pageSize: 10 }, 'nobody', ACTOR),
    ).resolves.toMatchObject({ items: [], total: 0, totalPages: 0 });
  });
});

describe('AdminUsersService.create', () => {
  const INPUT = { name: 'Sinta Dewi', email: 'sinta@tofly.id', role: 'admin' as const };

  it('adds an active Admin who can sign in at once, and records it', async () => {
    const { tx, users, service } = setup();

    await expect(service.create(INPUT, ACTOR)).resolves.toEqual(DTO);

    expect(users.create).toHaveBeenCalledWith({
      data: {
        name: 'Sinta Dewi',
        email: 'sinta@tofly.id',
        is_admin: true,
        admin_role: 'admin',
        is_active: true,
      },
      select: expect.objectContaining({ id: true, admin_role: true }),
    });
    expect(tx.audit_logs.create).toHaveBeenCalledExactlyOnceWith({
      data: {
        actor_user_id: ACTOR,
        actor_name: 'Gunta',
        actor_role: 'super_admin',
        category: 'akses_admin',
        action: 'admin_added',
        target_type: 'admin',
        target_id: 'user-sinta',
        target_label: 'Sinta Dewi',
        creator_id: null,
        old_values: undefined,
        new_values: { name: 'Sinta Dewi', email: 'sinta@tofly.id', role: 'admin' },
        note: null,
      },
    });
  });

  // "An email already used by any user is refused": a creator's, or a deactivated Admin's.
  it('refuses an email any user already has', async () => {
    const { tx, users, service } = setup();
    users.findUnique.mockImplementation(
      (args: { where: { email?: string } }) =>
        Promise.resolve(args.where.email === 'sinta@tofly.id' ? { id: 'user-x' } : ACTOR_ROW),
    );

    const error = await refusal(service.create(INPUT, ACTOR));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toEqual({
      message: 'Data admin tidak valid',
      errors: { email: 'Email sudah dipakai' },
    });
    expect(users.create).not.toHaveBeenCalled();
    expect(tx.audit_logs.create).not.toHaveBeenCalled();
  });

  it('refuses the same way when another request took the email first', async () => {
    const { users, service } = setup();
    users.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: 'test' }),
    );

    const error = await refusal(service.create(INPUT, ACTOR));

    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      errors: { email: 'Email sudah dipakai' },
    });
  });

  it('lets any other database error through', async () => {
    const { users, service } = setup();
    users.create.mockRejectedValue(new Error('connection lost'));

    await expect(service.create(INPUT, ACTOR)).rejects.toThrow('connection lost');
  });

  it('fails the add when its entry cannot be written, so it rolls back', async () => {
    const { tx, service } = setup();
    const failure = new Error('log failed');
    tx.audit_logs.create.mockRejectedValue(failure);

    await expect(service.create(INPUT, ACTOR)).rejects.toBe(failure);
  });
});

describe('AdminUsersService.rename', () => {
  it('changes the name under a row lock and records the old and new name', async () => {
    const { tx, users, service } = setup();
    targetIs(users, ROW);
    users.update.mockResolvedValue({ ...ROW, name: 'Sinta D.' });

    await expect(service.rename('user-sinta', { name: 'Sinta D.' }, ACTOR)).resolves.toEqual({
      ...DTO,
      name: 'Sinta D.',
    });

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      users.findUnique.mock.invocationCallOrder[0],
    );
    expect(users.update).toHaveBeenCalledWith({
      where: { id: 'user-sinta' },
      data: { name: 'Sinta D.' },
      select: expect.objectContaining({ id: true }),
    });
    expect(tx.audit_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'admin_changed',
        target_id: 'user-sinta',
        target_label: 'Sinta D.',
        old_values: { name: 'Sinta Dewi' },
        new_values: { name: 'Sinta D.' },
      }),
    });
  });

  // An Admin from before PBI-23 has no name; the entry then names them by email.
  it('labels an Admin who had no name by email in the old values', async () => {
    const { tx, users, service } = setup();
    targetIs(users, { ...ROW, name: null });
    users.update.mockResolvedValue(ROW);

    await service.rename('user-sinta', { name: 'Sinta Dewi' }, ACTOR);

    expect(tx.audit_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ old_values: { name: null } }),
    });
  });

  it('changes and records nothing when the name is the same', async () => {
    const { tx, users, service } = setup();
    targetIs(users, ROW);

    await expect(service.rename('user-sinta', { name: 'Sinta Dewi' }, ACTOR)).resolves.toEqual(DTO);
    expect(users.update).not.toHaveBeenCalled();
    expect(tx.audit_logs.create).not.toHaveBeenCalled();
  });

  it.each([
    ['nobody', null],
    ['a creator', { ...ROW, is_admin: false, admin_role: null }],
  ])('answers 404 for %s', async (_label, row) => {
    const { users, service } = setup();
    targetIs(users, row);

    const error = await refusal(service.rename('user-x', { name: 'A' }, ACTOR));

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toEqual({
      code: 'ADMIN_NOT_FOUND',
      message: 'Admin tidak ditemukan',
    });
  });
});

describe('AdminUsersService.reactivate', () => {
  const INACTIVE = { ...ROW, is_active: false };

  it('lets a deactivated Admin sign in again and records it', async () => {
    const { tx, users, service } = setup();
    targetIs(users, INACTIVE);
    users.update.mockResolvedValue(ROW);

    await expect(service.reactivate('user-sinta', ACTOR)).resolves.toEqual(DTO);

    expect(users.update).toHaveBeenCalledWith({
      where: { id: 'user-sinta' },
      data: { is_active: true },
      select: expect.objectContaining({ is_active: true }),
    });
    expect(tx.audit_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'admin_reactivated',
        target_label: 'Sinta Dewi',
        old_values: { status: 'inactive' },
        new_values: { status: 'active' },
      }),
    });
  });

  it('changes and records nothing for an Admin who is already active', async () => {
    const { tx, users, service } = setup();
    targetIs(users, ROW);

    await expect(service.reactivate('user-sinta', ACTOR)).resolves.toEqual(DTO);
    expect(users.update).not.toHaveBeenCalled();
    expect(tx.audit_logs.create).not.toHaveBeenCalled();
  });

  it('answers 404 for an id that is no Admin', async () => {
    const { users, service } = setup();
    targetIs(users, null);

    await expect(refusal(service.reactivate('user-x', ACTOR))).resolves.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('labels the entry by email for an Admin with no name', async () => {
    const { tx, users, service } = setup();
    targetIs(users, { ...INACTIVE, name: null });
    users.update.mockResolvedValue({ ...ROW, name: null });

    await service.reactivate('user-sinta', ACTOR);

    expect(tx.audit_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ target_label: 'sinta@tofly.id' }),
    });
  });
});
