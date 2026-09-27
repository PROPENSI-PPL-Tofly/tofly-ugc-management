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
    };
    const resolver = new PrismaWhitelistResolver(prisma);

    const principal = await resolver.resolve(email);

    expect(principal).toBeNull();
    expect(prisma.users.findUnique).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ where: { email } }),
    );
    expect(prisma.users.create).not.toHaveBeenCalled();
    expect(prisma.users.upsert).not.toHaveBeenCalled();
  });
});
