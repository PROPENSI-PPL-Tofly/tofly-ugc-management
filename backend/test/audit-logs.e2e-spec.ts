import { Prisma, PrismaClient } from '@prisma/client';

// SCRUM-295 (PBI-23 AC 18) against the real schema: a "Log Aktivitas" row can only be added, so no
// app action or API can change or delete it (OWASP A09:2025).

class RolledBack extends Error {}

describe('audit_logs (e2e)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Rows here can never be deleted, so each case rolls its own back.
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

  async function addRow(tx: Prisma.TransactionClient): Promise<string> {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      insert into audit_logs (actor_name, actor_role, category, action, target_type, target_label)
      values ('Sistem', 'system', 'pengaturan', 'rate_formula_changed', 'rate_formula', 'Formula Rate')
      returning id`;
    return row.id;
  }

  it('adds a row', async () => {
    await inRollback(async (tx) => {
      const id = await addRow(tx);
      const rows = await tx.$queryRaw<{ action: string }[]>`
        select action from audit_logs where id = ${id}::uuid`;

      expect(rows).toEqual([{ action: 'rate_formula_changed' }]);
    });
  });

  it('refuses to change a row', async () => {
    await expect(
      inRollback(async (tx) => {
        const id = await addRow(tx);
        await tx.$executeRaw`update audit_logs set action = 'changed' where id = ${id}::uuid`;
      }),
    ).rejects.toThrow(/audit_logs is append-only/);
  });

  it('refuses to delete a row', async () => {
    await expect(
      inRollback(async (tx) => {
        const id = await addRow(tx);
        await tx.$executeRaw`delete from audit_logs where id = ${id}::uuid`;
      }),
    ).rejects.toThrow(/audit_logs is append-only/);
  });

  it('refuses to empty the table', async () => {
    await expect(
      inRollback(async (tx) => {
        await addRow(tx);
        await tx.$executeRaw`truncate audit_logs`;
      }),
    ).rejects.toThrow(/audit_logs is append-only/);
  });
});
