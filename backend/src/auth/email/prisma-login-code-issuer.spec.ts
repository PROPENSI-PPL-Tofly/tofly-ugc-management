import {
  type LoginCodeIssuerClient,
  PrismaLoginCodeIssuer,
} from './prisma-login-code-issuer.js';

const NOW = new Date('2026-11-04T08:00:00.000Z');
const HOUR_AGO = new Date('2026-11-04T07:00:00.000Z');
const CODE = {
  email: 'rangga@example.com',
  codeHash: 'c'.repeat(64),
  expiresAt: new Date('2026-11-04T08:10:00.000Z'),
};

function minutesAgo(minutes: number): { createdAt: Date } {
  return { createdAt: new Date(NOW.getTime() - minutes * 60_000) };
}

/** A transaction client whose calls are recorded in order. */
function setup(inWindow: { createdAt: Date }[] = []) {
  const calls: string[] = [];
  const record =
    <T>(name: string, value: T) =>
    () => {
      calls.push(name);
      return Promise.resolve(value);
    };
  const tx = {
    $executeRaw: vi.fn(record('lock', 1)),
    login_codes: {
      findMany: vi.fn(record('window', inWindow)),
      updateMany: vi.fn(record('end earlier', { count: 1 })),
      create: vi.fn(record('store', {})),
    },
  };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const issuer = new PrismaLoginCodeIssuer(
    prisma as unknown as LoginCodeIssuerClient,
  );
  return { calls, tx, prisma, issuer };
}

describe('PrismaLoginCodeIssuer', () => {
  it('locks the email, counts its hour, ends its earlier codes and stores the new one, in one transaction', async () => {
    const { calls, prisma, issuer } = setup();

    await expect(issuer.issue(CODE, NOW)).resolves.toEqual({ issued: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['lock', 'window', 'end earlier', 'store']);
  });

  it('takes a transaction-level advisory lock on the email, bound as a parameter', async () => {
    const { tx, issuer } = setup();

    await issuer.issue(CODE, NOW);

    const [sql, ...values] = tx.$executeRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(sql.join('?')).toBe(
      'select pg_advisory_xact_lock(hashtextextended(?, 0))',
    );
    expect(values).toEqual(['login_codes:rangga@example.com']);
  });

  it('counts the codes the email was given in the last hour, decoys included, oldest first', async () => {
    const { tx, issuer } = setup();

    await issuer.issue(CODE, NOW);

    expect(tx.login_codes.findMany).toHaveBeenCalledWith({
      where: { email: CODE.email, createdAt: { gt: HOUR_AGO } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
      take: 5,
    });
  });

  it('ends every earlier code still live, so a new code invalidates the old one', async () => {
    const { tx, issuer } = setup();

    await issuer.issue(CODE, NOW);

    expect(tx.login_codes.updateMany).toHaveBeenCalledWith({
      where: { email: CODE.email, usedAt: null, expiresAt: { gt: NOW } },
      data: { expiresAt: NOW },
    });
  });

  it('stores only the hash, stamped with the same clock the hour is counted by', async () => {
    const { tx, issuer } = setup();

    await issuer.issue(CODE, NOW);

    expect(tx.login_codes.create).toHaveBeenCalledWith({
      data: { ...CODE, createdAt: NOW },
    });
  });

  it('issues the fifth code of the hour', async () => {
    const { calls, issuer } = setup([
      minutesAgo(50),
      minutesAgo(40),
      minutesAgo(30),
      minutesAgo(20),
    ]);

    await expect(issuer.issue(CODE, NOW)).resolves.toEqual({ issued: true });
    expect(calls).toContain('store');
  });

  it('refuses the sixth with the oldest code of the hour and changes nothing', async () => {
    const { calls, issuer } = setup([
      minutesAgo(45),
      minutesAgo(40),
      minutesAgo(30),
      minutesAgo(20),
      minutesAgo(10),
    ]);

    await expect(issuer.issue(CODE, NOW)).resolves.toEqual({
      issued: false,
      oldestInWindow: minutesAgo(45).createdAt,
    });
    expect(calls).toEqual(['lock', 'window']);
  });
});
