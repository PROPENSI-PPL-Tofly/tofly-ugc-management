import { PrismaWhitelistResolver } from './prisma-whitelist-resolver.js';
import type { Principal } from './ports.js';

// PRD Sprint 4, cross-PBI rule 1: a creator's access follows their contracts, read in the same one
// query that finds the user, so a sign-in and every request cost what they always did.
const SELECT = {
  id: true,
  is_admin: true,
  creators: {
    select: {
      id: true,
      contracts: {
        select: {
          end_date: true,
          invoice: { select: { status: true, paid_at: true } },
        },
      },
    },
  },
};

type Invoice = { status: string; paid_at: Date | null } | null;

function period(endDay: string, invoice: Invoice = null) {
  return { end_date: new Date(`${endDay}T00:00:00.000Z`), invoice };
}

function creatorUser(contracts: ReturnType<typeof period>[]) {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    is_admin: false,
    creators: { id: '33333333-3333-3333-3333-333333333333', contracts },
  };
}

const CREATOR: Principal = {
  userId: '22222222-2222-2222-2222-222222222222',
  role: 'creator',
  creatorId: '33333333-3333-3333-3333-333333333333',
};

function resolverFor(user: unknown) {
  const prisma = {
    users: {
      findUnique: vi.fn().mockResolvedValue(user),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  };
  return { prisma, resolver: new PrismaWhitelistResolver(prisma as never) };
}

describe('PrismaWhitelistResolver.resolve', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 10:00 WIB on 24 November 2026.
    vi.setSystemTime(new Date('2026-11-24T03:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('denies an unregistered email without creating a user', async () => {
    const { prisma, resolver } = resolverFor(null);

    await expect(resolver.resolve('unregistered@example.com')).resolves.toBeNull();

    expect(prisma.users.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { email: 'unregistered@example.com' },
      select: SELECT,
    });
    expect(prisma.users.create).not.toHaveBeenCalled();
    expect(prisma.users.upsert).not.toHaveBeenCalled();
  });

  it('resolves a whitelisted admin email to the admin principal, whatever contracts there are', async () => {
    const { resolver } = resolverFor({
      id: '11111111-1111-1111-1111-111111111111',
      is_admin: true,
      creators: null,
    });

    await expect(resolver.resolve('admin@tofly.id')).resolves.toEqual({
      userId: '11111111-1111-1111-1111-111111111111',
      role: 'admin',
    });
  });

  it('denies a non-admin user without a creator profile', async () => {
    const { resolver } = resolverFor({ id: 'user-x', is_admin: false, creators: null });

    await expect(resolver.resolve('noncreator@example.com')).resolves.toBeNull();
  });

  it('resolves a creator with a running period to the creator principal', async () => {
    const { resolver } = resolverFor(creatorUser([period('2026-12-15')]));

    await expect(resolver.resolve('creator@example.com')).resolves.toEqual(CREATOR);
  });

  it('lets a creator in before their first period starts', async () => {
    const { resolver } = resolverFor(creatorUser([period('2027-03-31', { status: 'running', paid_at: null })]));

    await expect(resolver.resolve('creator@example.com')).resolves.toEqual(CREATOR);
  });

  it('lets a creator in after their period while its invoice is not paid', async () => {
    const { resolver } = resolverFor(
      creatorUser([period('2026-10-31', { status: 'finalized', paid_at: null })]),
    );

    await expect(resolver.resolve('creator@example.com')).resolves.toEqual(CREATOR);
  });

  it('denies a creator the day after their last invoice was paid', async () => {
    const { resolver } = resolverFor(
      creatorUser([
        period('2026-10-31', { status: 'paid', paid_at: new Date('2026-11-23T03:00:00.000Z') }),
      ]),
    );

    await expect(resolver.resolve('creator@example.com')).resolves.toBeNull();
  });

  // PBI-37: "Batalkan Invoice" closes access at once when nothing else is left.
  it('denies a creator whose only invoice was just cancelled', async () => {
    const { resolver } = resolverFor(
      creatorUser([period('2026-11-24', { status: 'cancelled', paid_at: null })]),
    );

    await expect(resolver.resolve('creator@example.com')).resolves.toBeNull();
  });

  // 17:30 UTC on the 23rd is 00:30 WIB on the 24th: a period that ended on the 23rd is over.
  it('judges the day in Jakarta', async () => {
    vi.setSystemTime(new Date('2026-11-23T17:30:00.000Z'));
    const { resolver } = resolverFor(
      creatorUser([
        period('2026-11-23', { status: 'paid', paid_at: new Date('2026-11-22T03:00:00.000Z') }),
      ]),
    );

    await expect(resolver.resolve('creator@example.com')).resolves.toBeNull();
  });
});

// A session outlives its sign-in, so each request asks the whitelist again by the session's user
// id: an early end or a paid last invoice ends access on the next request (PRD 3.1).
describe('PrismaWhitelistResolver.resolveUser', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T03:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('looks the user up by id and applies the same rules as sign-in', async () => {
    const { prisma, resolver } = resolverFor(creatorUser([period('2026-12-15')]));

    await expect(resolver.resolveUser(CREATOR.userId)).resolves.toEqual(CREATOR);
    expect(prisma.users.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { id: CREATOR.userId },
      select: SELECT,
    });
  });

  it('refuses a creator whose contract was ended early with a cancelled invoice since sign-in', async () => {
    const { resolver } = resolverFor(
      creatorUser([period('2026-11-24', { status: 'cancelled', paid_at: null })]),
    );

    await expect(resolver.resolveUser(CREATOR.userId)).resolves.toBeNull();
  });

  it('refuses a user who no longer exists', async () => {
    const { resolver } = resolverFor(null);

    await expect(resolver.resolveUser('user-gone')).resolves.toBeNull();
  });
});
