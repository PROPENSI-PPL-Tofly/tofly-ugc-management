import type { CreatorNotifier } from '../email/creator-notifier.js';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ADMIN_ACTOR_NAME } from './content-event-actors.js';
import {
  ContentEditService,
  type ContentEditClient,
  type ContentEditTransaction,
  type EditableRow,
} from './content-edit.service.js';

const CONTENT_ID = '11111111-1111-4111-8111-111111111111';
const CONTRACT_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

function row(overrides: Partial<EditableRow> = {}): EditableRow {
  return {
    id: CONTENT_ID,
    contract_id: CONTRACT_ID,
    type: 'specific',
    name: 'Promo Lebaran',
    brief: 'Brief lama',
    deadline: new Date('2026-11-20T00:00:00Z'),
    status: 'scheduled',
    closed_at: null,
    _count: { submissions: 0 },
    contracts: {
      start_date: new Date('2026-10-01T00:00:00Z'),
      end_date: new Date('2026-12-31T00:00:00Z'),
      invoice: { status: 'running' },
      creators: {
        first_name: 'Rangga',
        middle_name: null,
        last_name: 'Pratama',
      },
    },
    ...overrides,
  };
}

function setup(
  found: EditableRow | null = row(),
  notifier?: Pick<CreatorNotifier, 'contentRescheduled' | 'contentDeleted'>,
) {
  const calls: string[] = [];
  const transaction = {
    $queryRaw: vi.fn(async (query: Prisma.Sql) => {
      calls.push(
        /FOR UPDATE OF contracts/.test(query.sql)
          ? 'lock contract'
          : 'lock content',
      );
      return [];
    }),
    contents: {
      findUnique: vi.fn(async () => {
        calls.push('read');
        return found;
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...found!,
        ...data,
      })),
      delete: vi.fn(async () => ({})),
    },
    content_events: { create: vi.fn(async () => ({})) },
  };
  const client: ContentEditClient = {
    $transaction: vi.fn(async (work, options) => {
      expect(options).toEqual({ isolationLevel: 'ReadCommitted' });
      return work(transaction as unknown as ContentEditTransaction);
    }),
  };
  const service = new ContentEditService(client, {
    // 08:00 in Jakarta on 5 Nov: the day the buffer counts from.
    today: () => new Date('2026-11-05T01:00:00Z'),
    bufferDays: async () => 5,
  }, notifier);
  return { service, transaction, calls };
}

describe('ContentEditService.update', () => {
  it('locks the contract, then the content, before reading it, so a Finalize or a draft under way finishes first (AC 9)', async () => {
    const { service, calls, transaction } = setup();

    await service.update(CONTENT_ID, { brief: 'Brief baru' }, ADMIN_ID);

    expect(calls).toEqual(['lock contract', 'lock content', 'read']);
    expect(transaction.contents.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CONTENT_ID } }),
    );
  });

  it('saves the change and records old and new values as the admin (AC 4)', async () => {
    const { service, transaction } = setup();

    const edited = await service.update(
      CONTENT_ID,
      { deadline: '2026-11-25', brief: 'Brief baru' },
      ADMIN_ID,
    );

    expect(transaction.contents.update).toHaveBeenCalledWith({
      where: { id: CONTENT_ID },
      data: { deadline: new Date('2026-11-25T00:00:00Z'), brief: 'Brief baru' },
      select: expect.any(Object),
    });
    expect(transaction.content_events.create).toHaveBeenCalledWith({
      data: {
        content_id: CONTENT_ID,
        event_type: 'Content Updated',
        actor_name: ADMIN_ACTOR_NAME,
        actor_role: 'admin',
        actor_user_id: ADMIN_ID,
        occurred_at: expect.any(Date),
        event_data: {
          changes: {
            deadline: { from: '2026-11-20', to: '2026-11-25' },
            brief: { from: 'Brief lama', to: 'Brief baru' },
          },
        },
      },
    });
    expect(edited).toEqual({
      id: CONTENT_ID,
      contractId: CONTRACT_ID,
      type: 'specific',
      name: 'Promo Lebaran',
      brief: 'Brief baru',
      deadline: '2026-11-25',
      status: 'scheduled',
    });
  });

  it('records the local admin stand-in, who has no account, with no user id', async () => {
    const { service, transaction } = setup();

    await service.update(CONTENT_ID, { brief: 'Brief baru' }, null);

    expect(transaction.content_events.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actor_user_id: null }),
    });
  });

  it('writes and records nothing when nothing differs, answering the content as it is', async () => {
    const { service, transaction } = setup();

    await expect(
      service.update(CONTENT_ID, { brief: 'Brief lama' }, ADMIN_ID),
    ).resolves.toMatchObject({ brief: 'Brief lama', deadline: '2026-11-20' });

    expect(transaction.contents.update).not.toHaveBeenCalled();
    expect(transaction.content_events.create).not.toHaveBeenCalled();
  });

  it('judges a new deadline from today in Jakarta and the scheduling buffer (AC 3)', async () => {
    const { service, transaction } = setup();

    await expect(
      service.update(CONTENT_ID, { deadline: '2026-11-09' }, ADMIN_ID),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(transaction.contents.update).not.toHaveBeenCalled();
  });

  it('answers 404 for a content that does not exist', async () => {
    const { service, transaction } = setup(null);

    await expect(
      service.update(CONTENT_ID, { brief: 'x' }, ADMIN_ID),
    ).rejects.toMatchObject({
      constructor: NotFoundException,
      response: {
        code: 'CONTENT_NOT_FOUND',
        message: 'Konten tidak ditemukan',
      },
    });
    expect(transaction.contents.update).not.toHaveBeenCalled();
  });

  it('changes nothing once a draft exists (AC 9)', async () => {
    const { service, transaction } = setup(row({ status: 'draft_review' }));

    await expect(
      service.update(CONTENT_ID, { brief: 'x' }, ADMIN_ID),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.contents.update).not.toHaveBeenCalled();
    expect(transaction.content_events.create).not.toHaveBeenCalled();
  });
});

describe('ContentEditService.remove', () => {
  it('locks the contract and the content, reads and then deletes the content for good (AC 8, 9)', async () => {
    const { service, transaction, calls } = setup();

    await expect(service.remove(CONTENT_ID)).resolves.toBeUndefined();

    expect(calls).toEqual(['lock contract', 'lock content', 'read']);
    expect(transaction.contents.delete).toHaveBeenCalledWith({
      where: { id: CONTENT_ID },
    });
  });

  it('answers 404 for a content that does not exist', async () => {
    const { service, transaction } = setup(null);

    await expect(service.remove(CONTENT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(transaction.contents.delete).not.toHaveBeenCalled();
  });

  it('deletes nothing once the invoice is finalized (AC 9)', async () => {
    const finalized = row();
    finalized.contracts.invoice = { status: 'finalized' };
    const { service, transaction } = setup(finalized);

    await expect(service.remove(CONTENT_ID)).rejects.toMatchObject({
      response: { code: 'INVOICE_FINALIZED' },
    });
    expect(transaction.contents.delete).not.toHaveBeenCalled();
  });
});

describe('ContentEditService defaults', () => {
  it('counts from the real clock with the default buffer when nothing is injected', async () => {
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      contents: {
        findUnique: vi.fn(async () => row()),
        update: vi.fn(),
        delete: vi.fn(),
      },
      content_events: { create: vi.fn() },
    };
    const service = new ContentEditService({
      $transaction: async (work) =>
        work(transaction as unknown as ContentEditTransaction),
    });

    // A day long past is before any earliest deadline the real clock can give.
    await expect(
      service.update(CONTENT_ID, { deadline: '2020-01-01' }, ADMIN_ID),
    ).rejects.toMatchObject({
      response: {
        errors: { deadline: expect.stringMatching(/^Deadline paling cepat /) },
      },
    });
  });
});

// PBI-11 (11.2, AC 1): Admin changes the deadline of or deletes the creator's content.
describe('ContentEditService, the creator email', () => {
  function emails() {
    return {
      contentRescheduled: vi.fn<CreatorNotifier['contentRescheduled']>().mockResolvedValue(),
      contentDeleted: vi.fn<CreatorNotifier['contentDeleted']>().mockResolvedValue(),
    };
  }

  it('tells the creator the new deadline after it is saved', async () => {
    const notifier = emails();
    const { service, transaction } = setup(row(), notifier);
    notifier.contentRescheduled.mockImplementation(async () => {
      expect(transaction.content_events.create).toHaveBeenCalled();
    });

    await service.update(CONTENT_ID, { deadline: '2026-11-25' }, ADMIN_ID);

    expect(notifier.contentRescheduled).toHaveBeenCalledExactlyOnceWith({
      contentId: CONTENT_ID,
      deadline: '2026-11-25',
    });
  });

  // AC 1 names the deadline only, so a brief or name change sends nothing.
  it('tells nobody when only the brief changes', async () => {
    const notifier = emails();
    const { service } = setup(row(), notifier);

    await service.update(CONTENT_ID, { brief: 'Brief baru' }, ADMIN_ID);

    expect(notifier.contentRescheduled).not.toHaveBeenCalled();
  });

  it('tells nobody when the edit is refused', async () => {
    const notifier = emails();
    const { service } = setup(null, notifier);

    await expect(service.update(CONTENT_ID, { deadline: '2026-11-25' }, ADMIN_ID)).rejects.toThrow();
    expect(notifier.contentRescheduled).not.toHaveBeenCalled();
  });

  it('tells the creator what was deleted, read before the row is gone', async () => {
    const notifier = emails();
    const { service, transaction } = setup(row(), notifier);
    notifier.contentDeleted.mockImplementation(async () => {
      expect(transaction.contents.delete).toHaveBeenCalled();
    });

    await service.remove(CONTENT_ID);

    expect(notifier.contentDeleted).toHaveBeenCalledExactlyOnceWith({
      contractId: CONTRACT_ID,
      contentId: CONTENT_ID,
      contentName: 'Promo Lebaran',
      deadline: '2026-11-20',
    });
  });

  it('tells nobody when the delete is refused', async () => {
    const notifier = emails();
    const finalized = row();
    finalized.contracts.invoice = { status: 'finalized' };
    const { service } = setup(finalized, notifier);

    await expect(service.remove(CONTENT_ID)).rejects.toThrow();
    expect(notifier.contentDeleted).not.toHaveBeenCalled();
  });
});
