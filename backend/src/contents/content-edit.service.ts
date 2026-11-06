import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { jakartaDay } from '../creators/evergreen.js';
import { DEFAULT_BUFFER_DAYS } from '../creators/new-creator.js';
import { lockContractOfContent } from '../invoices/contract-lock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  assertChangeable,
  planContentEdit,
  type ContentEdit,
  type ContentEditPlan,
  type EditableContent,
} from './content-edit.js';
import { adminActor, type AdminActor } from './content-event-actors.js';

/** What the controller depends on, so the persistence can be stubbed. */
export interface ContentEditor {
  update(
    id: string,
    edit: ContentEdit,
    adminUserId: string | null,
  ): Promise<EditedContent>;
  remove(id: string): Promise<void>;
}

/** The content after an edit, in the shape POST /contents answers with. */
export interface EditedContent {
  id: string;
  contractId: string;
  type: 'evergreen' | 'specific';
  name: string;
  brief: string;
  deadline: string;
  status: string;
}

/** Everything an edit or delete decides on, read in one query. */
export const EDITABLE_CONTENT_SELECT = {
  id: true,
  contract_id: true,
  type: true,
  name: true,
  brief: true,
  deadline: true,
  status: true,
  _count: { select: { submissions: true } },
  contracts: {
    select: {
      start_date: true,
      end_date: true,
      invoice: { select: { status: true } },
      creators: {
        select: { first_name: true, middle_name: true, last_name: true },
      },
    },
  },
} as const;

export type EditableRow = EditableContent & { contract_id: string };

/** The slice of Prisma an edit or delete uses, so unit tests stub exactly that. */
export interface ContentEditTransaction {
  $queryRaw(query: Prisma.Sql): Promise<unknown>;
  contents: {
    findUnique(args: {
      where: { id: string };
      select: typeof EDITABLE_CONTENT_SELECT;
    }): Promise<EditableRow | null>;
    update(args: {
      where: { id: string };
      data: ContentEditPlan['data'];
      select: typeof EDITABLE_CONTENT_SELECT;
    }): Promise<EditableRow>;
    delete(args: { where: { id: string } }): Promise<unknown>;
  };
  content_events: {
    create(args: {
      data: AdminActor & {
        content_id: string;
        event_type: 'Content Updated';
        occurred_at: Date;
        event_data: { changes: ContentEditPlan['changes'] };
      };
    }): Promise<unknown>;
  };
}

export interface ContentEditClient {
  $transaction<T>(
    work: (transaction: ContentEditTransaction) => Promise<T>,
    options: { isolationLevel: 'ReadCommitted' },
  ): Promise<T>;
}

/** The clock and the buffer the earliest-deadline rule reads, swapped in tests. */
export interface ContentEditScheduling {
  today(): Date;
  bufferDays(): Promise<number>;
}

function viewOf(row: EditableRow): EditedContent {
  return {
    id: row.id,
    contractId: row.contract_id,
    type: row.type,
    name: row.name,
    brief: row.brief,
    deadline: row.deadline.toISOString().slice(0, 10),
    status: row.status,
  };
}

/**
 * PATCH and DELETE /contents/:id (PBI-25, 25.1). Each runs in one transaction that locks the
 * contract and then the content row before reading anything (AC 9):
 * - a Finalize under way holds the contract, so the edit waits and then sees the invoice
 *   finalized and is refused, and a Finalize that comes after reads the content as changed;
 * - a draft handed in meanwhile waits for the content row, then finds the content changed or
 *   gone, and an edit or delete that comes after the draft sees it and is refused.
 * Finalize locks only the contract and a draft only the content row, so taking the contract
 * first cannot deadlock with either.
 */
@Injectable()
export class ContentEditService implements ContentEditor {
  private readonly scheduling: ContentEditScheduling;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: ContentEditClient,
    @Optional()
    @Inject('CONTENT_SCHEDULING')
    scheduling?: ContentEditScheduling,
  ) {
    this.scheduling = scheduling ?? {
      today: () => new Date(),
      bufferDays: async () => DEFAULT_BUFFER_DAYS,
    };
  }

  async update(
    id: string,
    edit: ContentEdit,
    adminUserId: string | null,
  ): Promise<EditedContent> {
    const rules = {
      today: jakartaDay(this.scheduling.today()),
      bufferDays: await this.scheduling.bufferDays(),
    };

    return this.prisma.$transaction(
      async (transaction) => {
        const content = await this.lockChangeable(transaction, id);
        const plan = planContentEdit(content, edit, rules);
        if (Object.keys(plan.changes).length === 0) {
          return viewOf(content);
        }

        const saved = await transaction.contents.update({
          where: { id },
          data: plan.data,
          select: EDITABLE_CONTENT_SELECT,
        });
        await transaction.content_events.create({
          data: {
            content_id: id,
            event_type: 'Content Updated',
            ...adminActor(adminUserId),
            occurred_at: new Date(),
            event_data: { changes: plan.changes },
          },
        });
        return viewOf(saved);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  /**
   * Deletes for good (AC 6, 8): the row, and by cascade its history, leave every list, the
   * Evergreen quota count and the penalties, which are all read from what is stored.
   */
  async remove(id: string): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        await this.lockChangeable(transaction, id);
        await transaction.contents.delete({ where: { id } });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  private async lockChangeable(
    transaction: ContentEditTransaction,
    id: string,
  ): Promise<EditableRow> {
    await lockContractOfContent(transaction, id);
    await transaction.$queryRaw(Prisma.sql`
      SELECT id FROM contents WHERE id = ${id}::uuid FOR UPDATE
    `);
    const content = await transaction.contents.findUnique({
      where: { id },
      select: EDITABLE_CONTENT_SELECT,
    });
    if (!content) {
      throw new NotFoundException({
        code: 'CONTENT_NOT_FOUND',
        message: 'Konten tidak ditemukan',
      });
    }
    assertChangeable(content);
    return content;
  }
}
