import { Prisma } from '@prisma/client';
import {
  SuperAdminBootstrap,
  superAdminEmail,
} from './super-admin-bootstrap.js';

// SCRUM-245 (PBI-23): "The first Super Admin is the email set in server config for each
// environment. After that, roles change only in the app."

describe('superAdminEmail', () => {
  it.each([
    ['unset', undefined, null],
    ['blank', '   ', null],
    ['a clean address', 'dev@tofly.id', 'dev@tofly.id'],
    ['an address with spaces and capitals', '  Dev@Tofly.ID ', 'dev@tofly.id'],
  ])('reads %s', (_label, raw, expected) => {
    expect(superAdminEmail(raw)).toBe(expected);
  });

  it.each([
    ['not an address', 'tofly-admin'],
    ['two addresses', 'a@tofly.id,b@tofly.id'],
    ['longer than 254 characters', `${'a'.repeat(250)}@t.id`],
  ])('refuses %s', (_label, raw) => {
    expect(() => superAdminEmail(raw)).toThrow(
      'SUPER_ADMIN_EMAIL is not a valid email address',
    );
  });
});

function setup({
  superAdmins = 0,
  existing = null as { id: string; creators: { id: string } | null } | null,
  createError = null as unknown,
} = {}) {
  const tx = {
    users: {
      count: vi.fn().mockResolvedValue(superAdmins),
      findUnique: vi.fn().mockResolvedValue(existing),
      update: vi.fn().mockResolvedValue({}),
      create: createError
        ? vi.fn().mockRejectedValue(createError)
        : vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const log = { log: vi.fn(), warn: vi.fn() };
  const bootstrap = new SuperAdminBootstrap(prisma as never, log);
  return { tx, prisma, log, bootstrap };
}

describe('SuperAdminBootstrap.ensure', () => {
  it('does nothing when SUPER_ADMIN_EMAIL is not set', async () => {
    const { prisma, bootstrap } = setup();

    await expect(bootstrap.ensure(undefined)).resolves.toBe('unset');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('leaves roles alone once any Super Admin exists, whoever it is', async () => {
    const { tx, bootstrap } = setup({ superAdmins: 1 });

    await expect(bootstrap.ensure('dev@tofly.id')).resolves.toBe('exists');
    expect(tx.users.count).toHaveBeenCalledWith({
      where: { admin_role: 'super_admin' },
    });
    expect(tx.users.update).not.toHaveBeenCalled();
    expect(tx.users.create).not.toHaveBeenCalled();
  });

  it('makes an existing Admin the first Super Admin, active again if deactivated', async () => {
    const { tx, bootstrap } = setup({
      existing: { id: 'user-1', creators: null },
    });

    await expect(bootstrap.ensure(' Dev@Tofly.id ')).resolves.toBe('promoted');
    expect(tx.users.findUnique).toHaveBeenCalledWith({
      where: { email: 'dev@tofly.id' },
      select: { id: true, creators: { select: { id: true } } },
    });
    expect(tx.users.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { is_admin: true, admin_role: 'super_admin', is_active: true },
    });
  });

  it('adds the email as the first Super Admin when no user has it', async () => {
    const { tx, bootstrap } = setup();

    await expect(bootstrap.ensure('dev@tofly.id')).resolves.toBe('created');
    expect(tx.users.create).toHaveBeenCalledWith({
      data: {
        email: 'dev@tofly.id',
        is_admin: true,
        admin_role: 'super_admin',
      },
    });
  });

  // OWASP A01: a creator's account never becomes an Admin's through server config.
  it("refuses to turn a creator's account into a Super Admin", async () => {
    const { tx, log, bootstrap } = setup({
      existing: { id: 'user-2', creators: { id: 'creator-1' } },
    });

    await expect(bootstrap.ensure('kreator@example.com')).resolves.toBe(
      'creator',
    );
    expect(tx.users.update).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      'SUPER_ADMIN_EMAIL belongs to a creator; no Super Admin was set',
    );
  });

  // Two instances starting together: the other one added the same row first.
  it('counts a duplicate email on create as already done', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { bootstrap } = setup({ createError: duplicate });

    await expect(bootstrap.ensure('dev@tofly.id')).resolves.toBe('exists');
  });

  it('lets any other database error through', async () => {
    const { bootstrap } = setup({ createError: new Error('connection lost') });

    await expect(bootstrap.ensure('dev@tofly.id')).rejects.toThrow(
      'connection lost',
    );
  });

  // The address is personal data; the log says what happened, never to whom (OWASP A09).
  it('logs the outcome without the address', async () => {
    const { log, bootstrap } = setup();

    await bootstrap.ensure('dev@tofly.id');

    expect(log.log).toHaveBeenCalledWith(
      'First Super Admin set from SUPER_ADMIN_EMAIL (created)',
    );
    expect(JSON.stringify(log.log.mock.calls)).not.toContain('dev@tofly.id');
  });
});

describe('SuperAdminBootstrap.onApplicationBootstrap', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads SUPER_ADMIN_EMAIL when the app starts', async () => {
    vi.stubEnv('SUPER_ADMIN_EMAIL', 'dev@tofly.id');
    const { tx, bootstrap } = setup();

    await bootstrap.onApplicationBootstrap();

    expect(tx.users.create).toHaveBeenCalled();
  });

  // A typo in the config must not keep the whole backend from starting; it is logged instead.
  it('logs an invalid SUPER_ADMIN_EMAIL and lets the app start', async () => {
    vi.stubEnv('SUPER_ADMIN_EMAIL', 'not-an-email');
    const { prisma, log, bootstrap } = setup();

    await expect(bootstrap.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      'SUPER_ADMIN_EMAIL is not a valid email address; no Super Admin was set',
    );
  });
});
