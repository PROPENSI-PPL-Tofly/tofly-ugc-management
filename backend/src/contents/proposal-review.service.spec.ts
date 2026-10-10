import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  ProposalReviewService,
  type ProposalNotifier,
  type ProposalReviewClient,
} from './proposal-review.service.js';

const ID = '11111111-1111-4111-8111-111111111111';
const CREATOR = '22222222-2222-4222-8222-222222222222';

interface Stored {
  status: string;
  name: string;
  contracts: { creator_id: string };
}

/**
 * An in-memory contents table that honours the compare-and-set filters, so the tests can
 * prove what reaches the row rather than only which calls were made.
 */
function stubClient(stored: Stored | null) {
  let row = stored ? { ...stored } : null;
  const events: unknown[] = [];
  const tables = {
    contents: {
      findUnique: vi.fn(async () => row),
      updateMany: vi.fn(async ({ where, data }: Parameters<ProposalReviewClient['contents']['updateMany']>[0]) => {
        if ('id' in where) {
          if (!row || where.id !== ID || row.status !== where.status) return { count: 0 };
          row = { ...row, status: data.status };
          return { count: 1 };
        }
        return { count: 3 };
      }),
      deleteMany: vi.fn(async ({ where }: Parameters<ProposalReviewClient['contents']['deleteMany']>[0]) => {
        if (!row || where.id !== ID || row.status !== where.status) return { count: 0 };
        row = null;
        return { count: 1 };
      }),
    },
    content_events: {
      create: vi.fn(async ({ data }: Parameters<ProposalReviewClient['content_events']['create']>[0]) => {
        events.push(data);
        return {};
      }),
    },
  };
  // The work runs against the same tables, as a transaction would see its own writes.
  const client: typeof tables & ProposalReviewClient = {
    ...tables,
    $transaction: (work) => work(client),
  };
  vi.spyOn(client, '$transaction');
  return { client, current: () => row, events: () => events };
}

function notifier() {
  return {
    proposalRejected: vi.fn<ProposalNotifier['proposalRejected']>(),
  } satisfies ProposalNotifier;
}

const pending: Stored = {
  status: 'pending',
  name: 'Ide konten dari Intan',
  contracts: { creator_id: CREATOR },
};

describe('ProposalReviewService.approve', () => {
  it('moves a pending proposal to scheduled, guarded on it still being pending', async () => {
    const { client, current } = stubClient(pending);

    await expect(new ProposalReviewService(client, notifier()).approve(ID)).resolves.toEqual({
      id: ID,
      status: 'scheduled',
    });

    expect(client.contents.updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: 'pending' },
      data: { status: 'scheduled' },
    });
    expect(current()?.status).toBe('scheduled');
  });

  it('answers 404 for a content that does not exist', async () => {
    const { client } = stubClient(null);

    const approving = new ProposalReviewService(client, notifier()).approve(ID);

    await expect(approving).rejects.toBeInstanceOf(NotFoundException);
    await expect(approving).rejects.toMatchObject({
      response: { code: 'CONTENT_NOT_FOUND', message: 'Konten tidak ditemukan' },
    });
  });

  it.each(['scheduled', 'draft_review', 'link_submitted'])(
    'answers 409 for a content already past pending (%s), changing nothing',
    async (status) => {
      const { client, current } = stubClient({ ...pending, status });

      const approving = new ProposalReviewService(client, notifier()).approve(ID);

      await expect(approving).rejects.toBeInstanceOf(ConflictException);
      await expect(approving).rejects.toMatchObject({
        response: {
          code: 'PROPOSAL_NOT_PENDING',
          message: 'Pengajuan ini sudah tidak menunggu keputusan',
        },
      });
      expect(current()?.status).toBe(status);
    },
  );

  it('lets only the first of two approvals through (double click)', async () => {
    const { client } = stubClient(pending);
    const service = new ProposalReviewService(client, notifier());

    const [first, second] = await Promise.allSettled([service.approve(ID), service.approve(ID)]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    expect((second as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
  });
});

describe('ProposalReviewService.approve, its history', () => {
  const ADMIN = '33333333-3333-4333-8333-333333333333';

  it('records Proposal Approved by the admin, in the same transaction as the status change', async () => {
    const { client, events } = stubClient(pending);

    await new ProposalReviewService(client, notifier()).approve(ID, ADMIN);

    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(events()).toEqual([
      {
        content_id: ID,
        event_type: 'Proposal Approved',
        actor_name: 'Admin',
        actor_role: 'admin',
        actor_user_id: ADMIN,
        occurred_at: expect.any(Date),
        event_data: {},
      },
    ]);
    expect(client.contents.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      client.content_events.create.mock.invocationCallOrder[0],
    );
  });

  it('records nothing when the approval is refused', async () => {
    const { client, events } = stubClient({ ...pending, status: 'scheduled' });

    await expect(
      new ProposalReviewService(client, notifier()).approve(ID, ADMIN),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(events()).toEqual([]);
  });

  it('records the step with no account behind it when no admin is signed in (the local stand-in)', async () => {
    const { client, events } = stubClient(pending);

    await new ProposalReviewService(client, notifier()).approve(ID);

    expect(events()).toEqual([expect.objectContaining({ actor_user_id: null })]);
  });

  it('never records the H-1 promotion as an approval: nobody approved it', async () => {
    const { client, events } = stubClient(pending);

    await new ProposalReviewService(client, notifier()).scheduleDue(
      new Date('2026-10-10T05:00:00.000Z'),
    );

    expect(events()).toEqual([]);
  });
});

describe('ProposalReviewService.reject', () => {
  it('removes the pending proposal and tells its creator why', async () => {
    const { client, current } = stubClient(pending);
    const notify = notifier();

    await expect(
      new ProposalReviewService(client, notify).reject(ID, { reason: 'Kurang relevan.' }),
    ).resolves.toEqual({ id: ID, removed: true });

    expect(client.contents.deleteMany).toHaveBeenCalledWith({
      where: { id: ID, status: 'pending' },
    });
    expect(current()).toBeNull();
    expect(notify.proposalRejected).toHaveBeenCalledWith({
      creatorId: CREATOR,
      contentName: 'Ide konten dari Intan',
      reason: 'Kurang relevan.',
    });
  });

  it('removes it without a reason too, since the reason is optional', async () => {
    const { client } = stubClient(pending);
    const notify = notifier();

    await new ProposalReviewService(client, notify).reject(ID, { reason: null });

    expect(notify.proposalRejected).toHaveBeenCalledWith(
      expect.objectContaining({ reason: null }),
    );
  });

  it('answers 404 for a content that does not exist, telling nobody', async () => {
    const { client } = stubClient(null);
    const notify = notifier();

    await expect(
      new ProposalReviewService(client, notify).reject(ID, { reason: null }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(client.contents.deleteMany).not.toHaveBeenCalled();
    expect(notify.proposalRejected).not.toHaveBeenCalled();
  });

  it('never removes committed work: a scheduled content answers 409 and stays', async () => {
    const { client, current } = stubClient({ ...pending, status: 'scheduled' });
    const notify = notifier();

    await expect(
      new ProposalReviewService(client, notify).reject(ID, { reason: null }),
    ).rejects.toMatchObject({ response: { code: 'PROPOSAL_NOT_PENDING' } });
    expect(client.contents.deleteMany).not.toHaveBeenCalled();
    expect(current()?.status).toBe('scheduled');
    expect(notify.proposalRejected).not.toHaveBeenCalled();
  });

  it('answers 409 when the proposal was decided between the read and the removal', async () => {
    const { client } = stubClient(pending);
    // Approved by another admin (or promoted at H-1) right after this one read it.
    client.contents.deleteMany.mockResolvedValueOnce({ count: 0 });
    const notify = notifier();

    await expect(
      new ProposalReviewService(client, notify).reject(ID, { reason: null }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(notify.proposalRejected).not.toHaveBeenCalled();
  });
});

describe('ProposalReviewService.scheduleDue', () => {
  it('promotes every pending proposal whose deadline is within H-1, in one statement', async () => {
    const { client } = stubClient(pending);

    await expect(
      new ProposalReviewService(client, notifier()).scheduleDue(
        new Date('2026-10-10T05:00:00.000Z'),
      ),
    ).resolves.toBe(3);

    expect(client.contents.updateMany).toHaveBeenCalledWith({
      where: { status: 'pending', deadline: { lte: new Date('2026-10-11T00:00:00.000Z') } },
      data: { status: 'scheduled' },
    });
  });
});

describe('ProposalReviewService without a notifier', () => {
  it('falls back to the mock email, as Add Content does, until notifications exist', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { client } = stubClient(pending);

    await new ProposalReviewService(client).reject(ID, { reason: 'Kurang relevan.' });

    expect(info).toHaveBeenCalledWith('[MOCK EMAIL] Creator proposal rejected', {
      creatorId: CREATOR,
      contentName: 'Ide konten dari Intan',
      reason: 'Kurang relevan.',
    });
    info.mockRestore();
  });
});
