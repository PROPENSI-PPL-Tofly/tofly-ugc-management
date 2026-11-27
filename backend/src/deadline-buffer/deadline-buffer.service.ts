import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  AuditLogger,
  type AuditActorReader,
  type AuditWriter,
} from '../audit/audit-logger.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DEFAULT_BUFFER_DAYS,
  isBufferDays,
  MAX_BUFFER_DAYS,
  MIN_BUFFER_DAYS,
} from './deadline-window.js';

/** The buffer and the range a form may offer (PBI-23 AC 20). */
export interface DeadlineBufferView {
  bufferDays: number;
  min: number;
  max: number;
}

/** Where every deadline rule reads the buffer from. */
export interface DeadlineBufferReader {
  current(): Promise<number>;
}

interface BufferTable {
  deadline_buffer: {
    findUnique(args: {
      where: { id: true };
      select: { buffer_days: true };
    }): Promise<{ buffer_days: number } | null>;
  };
}

type BufferTransaction = BufferTable &
  AuditWriter &
  AuditActorReader & {
    $executeRaw: Prisma.TransactionClient['$executeRaw'];
    deadline_buffer: BufferTable['deadline_buffer'] & {
      upsert(args: Prisma.deadline_bufferUpsertArgs): Promise<unknown>;
    };
  };

// The slice of Prisma this service uses, so a test stubs exactly that (DIP).
export interface DeadlineBufferClient extends BufferTable {
  $transaction<T>(work: (tx: BufferTransaction) => Promise<T>): Promise<T>;
}

function viewOf(bufferDays: number): DeadlineBufferView {
  return { bufferDays, min: MIN_BUFFER_DAYS, max: MAX_BUFFER_DAYS };
}

/** "Atur Buffer Deadline" (PBI-23 AC 20-22, SCRUM-298): the one buffer every deadline rule uses. */
@Injectable()
export class DeadlineBufferService implements DeadlineBufferReader {
  constructor(
    @Inject(PrismaService) private readonly prisma: DeadlineBufferClient,
    @Optional()
    @Inject(AuditLogger)
    private readonly audit: AuditLogger = new AuditLogger(),
  ) {}

  current(): Promise<number> {
    return this.read(this.prisma);
  }

  async view(): Promise<DeadlineBufferView> {
    return viewOf(await this.current());
  }

  /**
   * Saves the buffer. One save at a time, so each entry's old value is what the save before it
   * wrote, and the entry lands in the change's own transaction: a change is never kept without
   * its entry (OWASP A08:2025, A09:2025). A save that changes nothing writes and records nothing.
   * Deadlines already stored are never recalculated (the prototype: "Jadwal yang sudah ada tidak
   * berubah").
   */
  replace(
    bufferDays: number,
    actorId: string | undefined,
  ): Promise<DeadlineBufferView> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('deadline_buffer'))`;
      const before = await this.read(tx);
      if (before !== bufferDays) {
        const updatedBy = actorId ?? null;
        await tx.deadline_buffer.upsert({
          where: { id: true },
          create: { id: true, buffer_days: bufferDays, updated_by: updatedBy },
          update: {
            buffer_days: bufferDays,
            updated_by: updatedBy,
            updated_at: new Date(),
          },
        });
        await this.audit.recordBy(tx, actorId, {
          action: 'buffer_changed',
          target: { label: 'Buffer Deadline' },
          oldValues: { bufferDays: before },
          newValues: { bufferDays },
        });
      }
      return viewOf(bufferDays);
    });
  }

  // The stored buffer, or the default before one is stored. A value the setting can never hold
  // fails the request instead of judging deadlines by it (OWASP A10:2025).
  private async read(table: BufferTable): Promise<number> {
    const row = await table.deadline_buffer.findUnique({
      where: { id: true },
      select: { buffer_days: true },
    });
    const bufferDays = row?.buffer_days ?? DEFAULT_BUFFER_DAYS;
    if (!isBufferDays(bufferDays)) {
      throw new Error(`deadline_buffer holds ${bufferDays}, outside 1-14`);
    }
    return bufferDays;
  }
}
