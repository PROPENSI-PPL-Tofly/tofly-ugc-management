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
    ).rejects.toThrow(/audit_logs is append-only|permission denied/);
  });

  it('refuses to delete a row', async () => {
    await expect(
      inRollback(async (tx) => {
        const id = await addRow(tx);
        await tx.$executeRaw`delete from audit_logs where id = ${id}::uuid`;
      }),
    ).rejects.toThrow(/audit_logs is append-only|permission denied/);
  });

  it('refuses to empty the table', async () => {
    await expect(
      inRollback(async (tx) => {
        await addRow(tx);
        await tx.$executeRaw`truncate audit_logs`;
      }),
    ).rejects.toThrow(/audit_logs is append-only|permission denied/);
  });

  // Where the app connects as its own role, as in CI, staging and production. An owner could turn
  // the trigger off, so the app role must not own the table (OWASP A09:2025).
  describe.runIf(process.env.MIGRATOR_DB_URL)('from the app role', () => {
    it('does not own the table or its trigger function', async () => {
      const [row] = await prisma.$queryRaw<
        { owns_table: boolean; owns_function: boolean }[]
      >`
        select
          pg_get_userbyid(c.relowner) = current_user as owns_table,
          pg_get_userbyid(p.proowner) = current_user as owns_function
        from pg_class c, pg_proc p
        where c.oid = 'public.audit_logs'::regclass
          and p.oid = 'public.audit_logs_append_only'::regproc`;

      expect(row).toEqual({ owns_table: false, owns_function: false });
    });

    it('cannot turn the append-only trigger off', async () => {
      await expect(
        inRollback(async (tx) => {
          await tx.$executeRaw`alter table audit_logs disable trigger audit_logs_append_only`;
        }),
      ).rejects.toThrow(/must be owner/);
    });

    it.each([
      ['update', Prisma.sql`update audit_logs set action = 'changed'`],
      ['delete', Prisma.sql`delete from audit_logs`],
      ['truncate', Prisma.sql`truncate audit_logs`],
    ])('has no %s privilege', async (_name, statement) => {
      await expect(
        inRollback(async (tx) => {
          await tx.$executeRaw(statement);
        }),
      ).rejects.toThrow(/permission denied/);
    });
  });
});
