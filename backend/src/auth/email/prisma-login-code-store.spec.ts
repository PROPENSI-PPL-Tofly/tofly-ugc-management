import { PrismaLoginCodeStore } from './prisma-login-code-store.js';

const EMAIL = 'rangga@example.com';
const ROW = {
  id: '6a1f1d0e-2c1b-4d7e-9a55-0d3c1f7d9b10',
  code_hash: 'a'.repeat(64),
  expires_at: new Date('2026-11-04T03:10:00.000Z'),
  attempts: 2,
  used_at: null,
};

function fakePrisma() {
  return {
    $queryRaw: vi.fn(),
    login_codes: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

describe('PrismaLoginCodeStore', () => {
  it('reads the newest code for the email, so an older code stops counting once a new one is issued (AC 4)', async () => {
    const prisma = fakePrisma();
    prisma.login_codes.findFirst.mockResolvedValue(ROW);

    const row = await new PrismaLoginCodeStore(prisma).latest(EMAIL);

    expect(prisma.login_codes.findFirst).toHaveBeenCalledWith({
      where: { email: EMAIL },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        code_hash: true,
        expires_at: true,
        attempts: true,
        used_at: true,
      },
    });
    expect(row).toEqual({
      id: ROW.id,
      codeHash: ROW.code_hash,
      expiresAt: ROW.expires_at,
      attempts: 2,
      usedAt: null,
    });
  });

  it('answers null when the email has no code at all', async () => {
    const prisma = fakePrisma();
    prisma.login_codes.findFirst.mockResolvedValue(null);

    await expect(new PrismaLoginCodeStore(prisma).latest(EMAIL)).resolves.toBeNull();
  });

  it('counts a wrong guess in one conditional UPDATE, so parallel guesses never share a count (AC 8)', async () => {
    const prisma = fakePrisma();
    prisma.$queryRaw.mockResolvedValue([{ attempts: 3 }]);

    await expect(
      new PrismaLoginCodeStore(prisma).recordWrongAttempt(ROW.id),
    ).resolves.toBe(3);

    const [query] = prisma.$queryRaw.mock.calls[0] as [
      { strings: readonly string[]; values: unknown[] },
    ];
    const sql = query.strings.join('?').replace(/\s+/g, ' ');
    expect(sql).toContain('UPDATE login_codes SET attempts = attempts + 1');
    expect(sql).toContain('attempts < ?');
    expect(sql).toContain('RETURNING attempts');
    expect(query.values).toEqual([ROW.id, 5]);
  });

  it('answers null when the code had already reached five wrong attempts', async () => {
    const prisma = fakePrisma();
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(
      new PrismaLoginCodeStore(prisma).recordWrongAttempt(ROW.id),
    ).resolves.toBeNull();
  });

  it('claims an unused, untried-out code once; only the first of two submissions gets true', async () => {
    const prisma = fakePrisma();
    const at = new Date('2026-11-04T03:05:00.000Z');
    prisma.login_codes.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const store = new PrismaLoginCodeStore(prisma);

    await expect(store.claim(ROW.id, at)).resolves.toBe(true);
    await expect(store.claim(ROW.id, at)).resolves.toBe(false);

    expect(prisma.login_codes.updateMany).toHaveBeenCalledWith({
      where: { id: ROW.id, used_at: null, attempts: { lt: 5 } },
      data: { used_at: at },
    });
  });
});
