import { PrismaWhitelistResolver } from './prisma-whitelist-resolver.js';

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
      creators: {
        findUnique: vi.fn(),
      },
    };

    const resolver = new PrismaWhitelistResolver(prisma);

    const principal = await resolver.resolve(email);

    expect(principal).toBeNull();
    expect(prisma.users.findUnique).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        where: { email },
      }),
    );
    expect(prisma.users.create).not.toHaveBeenCalled();
    expect(prisma.users.upsert).not.toHaveBeenCalled();
  });

  it('resolves a whitelisted admin email to the ADMIN role', async () => {
    const user = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'admin@tofly.id',
      is_admin: true,
    };

    const prisma = {
      users: {
        findUnique: vi.fn().mockResolvedValue(user),
        create: vi.fn(),
        upsert: vi.fn(),
      },
      creators: {
        findUnique: vi.fn(),
      },
    };

    const resolver = new PrismaWhitelistResolver(prisma);

    const principal = await resolver.resolve(user.email);

    expect(principal).toEqual({
      userId: user.id,
      email: user.email,
      role: 'ADMIN',
    });

    expect(prisma.users.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { email: user.email },
    });
    expect(prisma.users.create).not.toHaveBeenCalled();
    expect(prisma.users.upsert).not.toHaveBeenCalled();
  });

  it('resolves an active whitelisted creator email to the CREATOR role', async () => {
    // Freeze time so contract validation stays deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T12:00:00.000Z'));

    try {
      const user = {
        id: '22222222-2222-2222-2222-222222222222',
        email: 'creator@example.com',
        is_admin: false,
      };

      const creator = {
        id: '33333333-3333-3333-3333-333333333333',
        user_id: user.id,
        access_revoke_date: null,
        contracts: [
          {
            start_date: new Date('2026-09-01T00:00:00.000Z'),
            end_date: new Date('2026-10-31T00:00:00.000Z'),
          },
        ],
      };

      const prisma = {
        users: {
          findUnique: vi.fn().mockResolvedValue(user),
          create: vi.fn(),
          upsert: vi.fn(),
        },
        creators: {
          findUnique: vi.fn().mockResolvedValue(creator),
        },
      };

      const resolver = new PrismaWhitelistResolver(prisma);

      const principal = await resolver.resolve(user.email);

      expect(principal).toEqual({
        userId: user.id,
        email: user.email,
        role: 'CREATOR',
      });

      expect(prisma.users.create).not.toHaveBeenCalled();
      expect(prisma.users.upsert).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('denies a creator whose access has been revoked', async () => {
  // Keep the contract active so revocation is the only reason access is denied.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-27T12:00:00.000Z'));

  try {
    const user = {
      id: '44444444-4444-4444-4444-444444444444',
      email: 'revoked.creator@example.com',
      is_admin: false,
    };

    const creator = {
      id: '55555555-5555-5555-5555-555555555555',
      user_id: user.id,
      access_revoke_date: new Date('2026-09-20T00:00:00.000Z'),
      contracts: [
        {
          start_date: new Date('2026-09-01T00:00:00.000Z'),
          end_date: new Date('2026-10-31T00:00:00.000Z'),
        },
      ],
    };

    const prisma = {
      users: {
        findUnique: vi.fn().mockResolvedValue(user),
        create: vi.fn(),
        upsert: vi.fn(),
      },
      creators: {
        findUnique: vi.fn().mockResolvedValue(creator),
      },
    };

    const resolver = new PrismaWhitelistResolver(prisma);

    const principal = await resolver.resolve(user.email);

    expect(principal).toBeNull();

    expect(prisma.creators.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: {
        user_id: user.id,
      },
      include: {
        contracts: true,
      },
    });

    expect(prisma.users.create).not.toHaveBeenCalled();
    expect(prisma.users.upsert).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
});