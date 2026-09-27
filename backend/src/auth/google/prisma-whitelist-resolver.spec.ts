import { PrismaWhitelistResolver } from './prisma-whitelist-resolver.js';
import type { Principal } from './ports.js';

describe('PrismaWhitelistResolver', () => {
  it('denies an unregistered email without creating a user', async () => {
    // Google verification has already succeeded; registration is still required.
    const email = 'unregistered@example.com';

    const prisma = {
      users: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        upsert: vi.fn(),
      },
    };

    const resolver = new PrismaWhitelistResolver(prisma);

    const principal = await resolver.resolve(email);

    expect(principal).toBeNull();

    expect(prisma.users.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { email },
      select: {
        id: true,
        is_admin: true,
        creators: {
          select: {
            id: true,
            access_revoke_date: true,
          },
        },
      },
    });

    expect(prisma.users.create).not.toHaveBeenCalled();
    expect(prisma.users.upsert).not.toHaveBeenCalled();
  });

  it('resolves a whitelisted admin email to the admin principal', async () => {
    const user = {
      id: '11111111-1111-1111-1111-111111111111',
      is_admin: true,
      creators: null,
    };

    const prisma = {
      users: {
        findUnique: vi.fn().mockResolvedValue(user),
        create: vi.fn(),
        upsert: vi.fn(),
      },
    };

    const resolver = new PrismaWhitelistResolver(prisma);

    const principal = await resolver.resolve('admin@tofly.id');

    const expected: Principal = {
      userId: user.id,
      role: 'admin',
    };

    expect(principal).toEqual(expected);

    expect(prisma.users.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { email: 'admin@tofly.id' },
      select: {
        id: true,
        is_admin: true,
        creators: {
          select: {
            id: true,
            access_revoke_date: true,
          },
        },
      },
    });

    expect(prisma.users.create).not.toHaveBeenCalled();
    expect(prisma.users.upsert).not.toHaveBeenCalled();
  });

  it('denies a non-admin user without a creator profile', async () => {
    const user = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      is_admin: false,
      creators: null,
    };

    const prisma = {
      users: {
        findUnique: vi.fn().mockResolvedValue(user),
        create: vi.fn(),
        upsert: vi.fn(),
      },
    };

    const resolver = new PrismaWhitelistResolver(prisma);

    const principal = await resolver.resolve('noncreator@example.com');

    expect(principal).toBeNull();

    expect(prisma.users.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { email: 'noncreator@example.com' },
      select: {
        id: true,
        is_admin: true,
        creators: {
          select: {
            id: true,
            access_revoke_date: true,
          },
        },
      },
    });

    expect(prisma.users.create).not.toHaveBeenCalled();
    expect(prisma.users.upsert).not.toHaveBeenCalled();
  });

  it('resolves a whitelisted creator email to the creator principal', async () => {
    const creator = {
      id: '33333333-3333-3333-3333-333333333333',
      access_revoke_date: null,
    };

    const user = {
      id: '22222222-2222-2222-2222-222222222222',
      is_admin: false,
      creators: creator,
    };

    const prisma = {
      users: {
        findUnique: vi.fn().mockResolvedValue(user),
        create: vi.fn(),
        upsert: vi.fn(),
      },
    };

    const resolver = new PrismaWhitelistResolver(prisma);

    const principal = await resolver.resolve('creator@example.com');

    const expected: Principal = {
      userId: user.id,
      role: 'creator',
      creatorId: creator.id,
    };

    expect(principal).toEqual(expected);

    expect(prisma.users.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { email: 'creator@example.com' },
      select: {
        id: true,
        is_admin: true,
        creators: {
          select: {
            id: true,
            access_revoke_date: true,
          },
        },
      },
    });

    expect(prisma.users.create).not.toHaveBeenCalled();
    expect(prisma.users.upsert).not.toHaveBeenCalled();
  });

  it('denies a creator whose scheduled revoke date has been reached', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T12:00:00.000Z'));

    try {
      const creator = {
        id: '55555555-5555-5555-5555-555555555555',
        access_revoke_date: new Date('2026-09-20T00:00:00.000Z'),
      };

      const user = {
        id: '44444444-4444-4444-4444-444444444444',
        is_admin: false,
        creators: creator,
      };

      const prisma = {
        users: {
          findUnique: vi.fn().mockResolvedValue(user),
          create: vi.fn(),
          upsert: vi.fn(),
        },
      };

      const resolver = new PrismaWhitelistResolver(prisma);

      const principal = await resolver.resolve('revoked.creator@example.com');

      expect(principal).toBeNull();

      expect(prisma.users.create).not.toHaveBeenCalled();
      expect(prisma.users.upsert).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows a creator before the scheduled revoke date', async () => {
    // A future revoke date is only a schedule; access remains valid until that date.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T12:00:00.000Z'));

    try {
      const creator = {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        access_revoke_date: new Date('2026-09-28T00:00:00.000Z'),
      };

      const user = {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        is_admin: false,
        creators: creator,
      };

      const prisma = {
        users: {
          findUnique: vi.fn().mockResolvedValue(user),
          create: vi.fn(),
          upsert: vi.fn(),
        },
      };

      const resolver = new PrismaWhitelistResolver(prisma);

      const principal = await resolver.resolve('scheduled.revoke@example.com');

      const expected: Principal = {
        userId: user.id,
        role: 'creator',
        creatorId: creator.id,
      };

      expect(principal).toEqual(expected);

      expect(prisma.users.create).not.toHaveBeenCalled();
      expect(prisma.users.upsert).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows a creator after their contract period while access is not revoked', async () => {
    // Contract dates do not control login access; revocation does.
    const creator = {
      id: '77777777-7777-7777-7777-777777777777',
      access_revoke_date: null,
    };

    const user = {
      id: '66666666-6666-6666-6666-666666666666',
      is_admin: false,
      creators: creator,
    };

    const prisma = {
      users: {
        findUnique: vi.fn().mockResolvedValue(user),
        create: vi.fn(),
        upsert: vi.fn(),
      },
    };

    const resolver = new PrismaWhitelistResolver(prisma);

    const principal = await resolver.resolve('expired.creator@example.com');

    const expected: Principal = {
      userId: user.id,
      role: 'creator',
      creatorId: creator.id,
    };

    expect(principal).toEqual(expected);

    expect(prisma.users.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { email: 'expired.creator@example.com' },
      select: {
        id: true,
        is_admin: true,
        creators: {
          select: {
            id: true,
            access_revoke_date: true,
          },
        },
      },
    });

    expect(prisma.users.create).not.toHaveBeenCalled();
    expect(prisma.users.upsert).not.toHaveBeenCalled();
  });

  it('allows a creator before their contract period while access is not revoked', async () => {
    // Whitelisting enables login immediately; contract dates do not gate authentication.
    const creator = {
      id: '99999999-9999-9999-9999-999999999999',
      access_revoke_date: null,
    };

    const user = {
      id: '88888888-8888-8888-8888-888888888888',
      is_admin: false,
      creators: creator,
    };

    const prisma = {
      users: {
        findUnique: vi.fn().mockResolvedValue(user),
        create: vi.fn(),
        upsert: vi.fn(),
      },
    };

    const resolver = new PrismaWhitelistResolver(prisma);

    const principal = await resolver.resolve('future.creator@example.com');

    const expected: Principal = {
      userId: user.id,
      role: 'creator',
      creatorId: creator.id,
    };

    expect(principal).toEqual(expected);

    expect(prisma.users.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { email: 'future.creator@example.com' },
      select: {
        id: true,
        is_admin: true,
        creators: {
          select: {
            id: true,
            access_revoke_date: true,
          },
        },
      },
    });

    expect(prisma.users.create).not.toHaveBeenCalled();
    expect(prisma.users.upsert).not.toHaveBeenCalled();
  });

  it('revokes creator access based on the Jakarta calendar day', async () => {
    // 27 Sep 17:30 UTC = 28 Sep 00:30 WIB.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T17:30:00.000Z'));

    try {
      const creator = {
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        access_revoke_date: new Date('2026-09-28T00:00:00.000Z'),
      };

      const user = {
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        is_admin: false,
        creators: creator,
      };

      const prisma = {
        users: {
          findUnique: vi.fn().mockResolvedValue(user),
          create: vi.fn(),
          upsert: vi.fn(),
        },
      };

      const resolver = new PrismaWhitelistResolver(prisma);

      const principal = await resolver.resolve('jakarta.revoke@example.com');

      expect(principal).toBeNull();

      expect(prisma.users.create).not.toHaveBeenCalled();
      expect(prisma.users.upsert).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

// A session outlives its sign-in, so each request asks the whitelist again by the session's
// user id: revoking a creator ends their access on the next request (PRD 3.1).
describe('PrismaWhitelistResolver.resolveUser', () => {
  const SELECT = {
    id: true,
    is_admin: true,
    creators: { select: { id: true, access_revoke_date: true } },
  };

  function resolverFor(user: unknown) {
    const prisma = { users: { findUnique: vi.fn().mockResolvedValue(user) } };
    return { prisma, resolver: new PrismaWhitelistResolver(prisma) };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('looks the user up by id and applies the same rules as sign-in', async () => {
    const { prisma, resolver } = resolverFor({
      id: 'user-1',
      is_admin: false,
      creators: { id: 'creator-1', access_revoke_date: null },
    });

    await expect(resolver.resolveUser('user-1')).resolves.toEqual({
      userId: 'user-1',
      role: 'creator',
      creatorId: 'creator-1',
    });
    expect(prisma.users.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'user-1' },
      select: SELECT,
    });
  });

  it('refuses a creator whose revoke date has been reached since sign-in', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T03:00:00.000Z'));
    const { resolver } = resolverFor({
      id: 'user-1',
      is_admin: false,
      creators: {
        id: 'creator-1',
        access_revoke_date: new Date('2026-09-28T00:00:00.000Z'),
      },
    });

    await expect(resolver.resolveUser('user-1')).resolves.toBeNull();
  });

  it('refuses a user who no longer exists', async () => {
    const { resolver } = resolverFor(null);

    await expect(resolver.resolveUser('user-gone')).resolves.toBeNull();
  });
});
