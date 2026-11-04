import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { IssueRequest } from '../src/auth/email/login-code-issuer.js';
import { PrismaLoginCodeIssuer } from '../src/auth/email/prisma-login-code-issuer.js';

// The rate limit and the code replacement against real Postgres (PBI-39, SCRUM-240): only a
// database shows whether simultaneous transactions can both see room for the last slot.

const MINUTE = 60_000;

describe('PrismaLoginCodeIssuer against Postgres (e2e)', () => {
  const prisma = new PrismaClient();
  const issuer = new PrismaLoginCodeIssuer(prisma);
  const emails: string[] = [];

  function freshEmail(): string {
    const email = `e2e-${randomUUID()}@example.com`;
    emails.push(email);
    return email;
  }

  function request(email: string, now = new Date()): IssueRequest {
    return {
      email,
      codeHash: randomBytes(32).toString('hex'),
      createdAt: now,
      expiresAt: new Date(now.getTime() + 10 * MINUTE),
      windowStart: new Date(now.getTime() - 60 * MINUTE),
      limit: 5,
    };
  }

  afterAll(async () => {
    await prisma.login_codes.deleteMany({ where: { email: { in: emails } } });
    await prisma.login_code_requests.deleteMany({
      where: { email: { in: emails } },
    });
    await prisma.$disconnect();
  });

  it('lets exactly five of twelve simultaneous requests for one email through', async () => {
    const email = freshEmail();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => issuer.issue(request(email))),
    );
    expect(results.filter((result) => result.issued)).toHaveLength(5);
    expect(results.filter((result) => !result.issued)).toHaveLength(7);
    expect(await prisma.login_codes.count({ where: { email } })).toBe(5);
    expect(await prisma.login_code_requests.count({ where: { email } })).toBe(
      5,
    );
  });

  it('never holds one email back for another', async () => {
    const [first, second] = [freshEmail(), freshEmail()];
    for (let i = 0; i < 5; i += 1) await issuer.issue(request(first));
    await expect(issuer.issue(request(second))).resolves.toMatchObject({
      issued: true,
    });
  });

  it('makes the newest code the one verification reads', async () => {
    const email = freshEmail();
    const now = Date.now();
    await issuer.issue(request(email, new Date(now - MINUTE)));
    const second = await issuer.issue(request(email, new Date(now)));
    const newest = await prisma.login_codes.findFirst({
      where: { email },
      orderBy: { created_at: 'desc' },
    });
    expect(second).toEqual({ issued: true, id: newest?.id });
  });

  it('discards only its own row, leaving the earlier code the newest again', async () => {
    const email = freshEmail();
    const now = Date.now();
    const kept = await issuer.issue(request(email, new Date(now - MINUTE)));
    const unsent = await issuer.issue(request(email, new Date(now)));
    if (!unsent.issued || !kept.issued) throw new Error('expected two rows');
    await issuer.discard(unsent.id);
    const rows = await prisma.login_codes.findMany({ where: { email } });
    expect(rows.map((row) => row.id)).toEqual([kept.id]);
  });

  it('still counts a request whose code was discarded, so a failed email cannot free its slot', async () => {
    const email = freshEmail();
    for (let i = 0; i < 4; i += 1) await issuer.issue(request(email));
    const unsent = await issuer.issue(request(email));
    if (!unsent.issued) throw new Error('expected a fifth code');
    await issuer.discard(unsent.id);

    await expect(issuer.issue(request(email))).resolves.toMatchObject({
      issued: false,
    });
    expect(await prisma.login_codes.count({ where: { email } })).toBe(4);
  });

  it('forgets requests older than the hour, whatever their email, and keeps the rest', async () => {
    const [stale, fresh] = [freshEmail(), freshEmail()];
    const now = Date.now();
    await prisma.login_code_requests.createMany({
      data: [
        { email: stale, requested_at: new Date(now - 61 * MINUTE) },
        { email: fresh, requested_at: new Date(now - 59 * MINUTE) },
      ],
    });

    await issuer.issue(request(freshEmail()));

    expect(
      await prisma.login_code_requests.count({ where: { email: stale } }),
    ).toBe(0);
    expect(
      await prisma.login_code_requests.count({ where: { email: fresh } }),
    ).toBe(1);
  });
});
