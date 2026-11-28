import { DeadlineBufferService } from './deadline-buffer.service.js';

const SUPER_ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';

describe('DeadlineBufferService (SCRUM-298)', () => {
  const calls: string[] = [];
  const tx = {
    $executeRaw: vi.fn(async () => {
      calls.push('lock');
      return 1;
    }),
    deadline_buffer: { findUnique: vi.fn(), upsert: vi.fn() },
  };
  const prisma = {
    deadline_buffer: { findUnique: vi.fn() },
    $transaction: vi.fn(async (work: (client: typeof tx) => unknown) =>
      work(tx),
    ),
  };
  const audit = { recordBy: vi.fn() };
  let service: DeadlineBufferService;

  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    prisma.deadline_buffer.findUnique.mockResolvedValue({ buffer_days: 7 });
    tx.deadline_buffer.findUnique.mockImplementation(async () => {
      calls.push('read');
      return { buffer_days: 7 };
    });
    tx.deadline_buffer.upsert.mockImplementation(async () => {
      calls.push('write');
    });
    audit.recordBy.mockImplementation(async () => {
      calls.push('audit');
    });
    service = new DeadlineBufferService(prisma as never, audit as never);
  });

  describe('current', () => {
    it('reads the stored buffer', async () => {
      expect(await service.current()).toBe(7);
      expect(prisma.deadline_buffer.findUnique).toHaveBeenCalledWith({
        where: { id: true },
        select: { buffer_days: true },
      });
    });

    // The migration adds the row; without it the documented default holds (AC 20).
    it('reads 5 days while no buffer is stored', async () => {
      prisma.deadline_buffer.findUnique.mockResolvedValue(null);

      expect(await service.current()).toBe(5);
    });

    // OWASP A10:2025: never judge deadlines by a value the setting cannot hold, nor by a guess.
    it('fails instead of using a stored value outside 1-14', async () => {
      prisma.deadline_buffer.findUnique.mockResolvedValue({ buffer_days: 0 });

      await expect(service.current()).rejects.toThrow(/deadline_buffer/);
    });

    it('fails when the buffer cannot be read', async () => {
      prisma.deadline_buffer.findUnique.mockRejectedValue(
        new Error('connection lost'),
      );

      await expect(service.current()).rejects.toThrow('connection lost');
    });
  });

  it('answers the buffer with the range a form may offer', async () => {
    expect(await service.view()).toEqual({ bufferDays: 7, min: 1, max: 14 });
  });

  describe('replace', () => {
    // OWASP A08:2025, A09:2025: one save at a time, so each entry's old value is what the save
    // before it wrote, and the entry lands in the same transaction as the change.
    it('locks, reads, writes and records the change in one transaction', async () => {
      const saved = await service.replace(5, SUPER_ADMIN);

      expect(saved).toEqual({ bufferDays: 5, min: 1, max: 14 });
      expect(calls).toEqual(['lock', 'read', 'write', 'audit']);
      expect(tx.deadline_buffer.upsert).toHaveBeenCalledWith({
        where: { id: true },
        create: { id: true, buffer_days: 5, updated_by: SUPER_ADMIN },
        update: {
          buffer_days: 5,
          updated_by: SUPER_ADMIN,
          updated_at: expect.any(Date),
        },
      });
      expect(audit.recordBy).toHaveBeenCalledWith(tx, SUPER_ADMIN, {
        action: 'buffer_changed',
        target: { label: 'Buffer Deadline' },
        oldValues: { bufferDays: 7 },
        newValues: { bufferDays: 5 },
      });
    });

    it('records the change from 5 days when no buffer was stored yet', async () => {
      tx.deadline_buffer.findUnique.mockResolvedValue(null);

      await service.replace(9, SUPER_ADMIN);

      expect(audit.recordBy).toHaveBeenCalledWith(
        tx,
        SUPER_ADMIN,
        expect.objectContaining({
          oldValues: { bufferDays: 5 },
          newValues: { bufferDays: 9 },
        }),
      );
    });

    it('stores no one behind the local development stand-in', async () => {
      await service.replace(5, undefined);

      expect(tx.deadline_buffer.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { id: true, buffer_days: 5, updated_by: null },
        }),
      );
    });

    // A save that changes nothing is no change to record, nor to write.
    it('writes and records nothing when the buffer stays the same', async () => {
      const saved = await service.replace(7, SUPER_ADMIN);

      expect(saved).toEqual({ bufferDays: 7, min: 1, max: 14 });
      expect(calls).toEqual(['lock', 'read']);
    });

    // The transaction rejects, so Prisma rolls the write back (proven on Postgres end to end).
    it('fails the save when its entry cannot be recorded', async () => {
      audit.recordBy.mockRejectedValue(new Error('audit down'));

      await expect(service.replace(5, SUPER_ADMIN)).rejects.toThrow(
        'audit down',
      );
    });
  });
});
