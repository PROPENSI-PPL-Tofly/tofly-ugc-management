import { PrismaClient } from '@prisma/client';
import { DeadlineBufferService } from '../src/deadline-buffer/deadline-buffer.service.js';

// SCRUM-298 against Postgres: a buffer change and its Log Aktivitas entry commit together or not
// at all (OWASP A09:2025), and two saves at once leave a trail whose old and new values chain
// (OWASP A08:2025). The buffer is global, so the suite puts back the value it found; entries stay,
// as Log Aktivitas can only be added to, and they read as Sistem (no user behind these saves).

type Entry = { id: string; old: number; neu: number };

describe('DeadlineBufferService on Postgres (e2e)', () => {
  const prisma = new PrismaClient();
  const service = new DeadlineBufferService(prisma as never);
  let original: number;

  const stored = async () =>
    (await prisma.deadline_buffer.findUniqueOrThrow({ where: { id: true } }))
      .buffer_days;

  async function entries(): Promise<Entry[]> {
    const rows = await prisma.audit_logs.findMany({
      where: { action: 'buffer_changed' },
      select: { id: true, old_values: true, new_values: true },
    });
    return rows.map(({ id, old_values, new_values }) => ({
      id,
      old: (old_values as { bufferDays: number }).bufferDays,
      neu: (new_values as { bufferDays: number }).bufferDays,
    }));
  }

  async function entriesAfter(work: () => Promise<unknown>): Promise<Entry[]> {
    const before = new Set((await entries()).map(({ id }) => id));
    await work();
    return (await entries()).filter(({ id }) => !before.has(id));
  }

  beforeAll(async () => {
    original = await stored();
  });

  afterAll(async () => {
    await service.replace(original, undefined);
    await prisma.$disconnect();
  });

  it('keeps the buffer as it was when its entry cannot be recorded', async () => {
    const failing = new DeadlineBufferService(
      prisma as never,
      {
        recordBy: async () => {
          throw new Error('audit down');
        },
      } as never,
    );
    const before = await stored();

    const added = await entriesAfter(() =>
      expect(
        failing.replace(before === 11 ? 12 : 11, undefined),
      ).rejects.toThrow('audit down'),
    );

    expect(await stored()).toBe(before);
    expect(added).toEqual([]);
  });

  it('chains the old and new values of two saves made at once', async () => {
    await service.replace(4, undefined);

    const added = await entriesAfter(() =>
      Promise.all([
        service.replace(10, undefined),
        service.replace(12, undefined),
      ]),
    );

    // Whichever save took the lock first, the second read what the first wrote.
    const first = added.find(({ old }) => old === 4);
    const second = added.find((entry) => entry !== first);
    expect(added).toHaveLength(2);
    expect(first).toBeDefined();
    expect(second?.old).toBe(first?.neu);
    expect(await stored()).toBe(second?.neu);
  });
});
