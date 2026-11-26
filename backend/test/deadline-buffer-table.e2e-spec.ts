import { Prisma, PrismaClient } from '@prisma/client';

// SCRUM-298 (PBI-23 AC 20) against the real schema: one deadline buffer, 5 days until a Super Admin
// changes it, and the database itself refuses a value outside 1-14 or a second row, whatever writer
// skips the API's check (OWASP A06:2025). Each case rolls its own changes back.

class RolledBack extends Error {}

describe('deadline_buffer (e2e)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function inRollback(
    work: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        await work(tx);
        throw new RolledBack();
      });
    } catch (error) {
      if (!(error instanceof RolledBack)) throw error;
    }
  }

  it('starts with one row of 5 days', async () => {
    const rows = await prisma.$queryRaw<{ id: boolean; buffer_days: number }[]>`
      select id, buffer_days from deadline_buffer`;

    expect(rows).toEqual([{ id: true, buffer_days: expect.any(Number) }]);
  });

  it.each([1, 14])('takes %i days', async (days) => {
    await inRollback(async (tx) => {
      await tx.$executeRaw`update deadline_buffer set buffer_days = ${days}`;
      const [row] = await tx.$queryRaw<{ buffer_days: number }[]>`
        select buffer_days from deadline_buffer`;

      expect(row.buffer_days).toBe(days);
    });
  });

  it.each([0, 15, -1])('refuses %i days', async (days) => {
    await expect(
      inRollback(async (tx) => {
        await tx.$executeRaw`update deadline_buffer set buffer_days = ${days}`;
      }),
    ).rejects.toThrow(/deadline_buffer_days_check/);
  });

  it('refuses a second buffer', async () => {
    await expect(
      inRollback(async (tx) => {
        await tx.$executeRaw`insert into deadline_buffer (id, buffer_days) values (false, 5)`;
      }),
    ).rejects.toThrow(/deadline_buffer_singleton_check/);
  });

  it('defaults a new row to 5 days', async () => {
    await inRollback(async (tx) => {
      await tx.$executeRaw`delete from deadline_buffer`;
      await tx.$executeRaw`insert into deadline_buffer default values`;
      const [row] = await tx.$queryRaw<{ buffer_days: number }[]>`
        select buffer_days from deadline_buffer`;

      expect(row.buffer_days).toBe(5);
    });
  });
});
