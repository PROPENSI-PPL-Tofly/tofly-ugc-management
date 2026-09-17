import type { Clock } from '../common/clock.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MyTaskService, type TaskRow, toMyTask } from './my-task.service.js';

const TODAY = new Date('2026-09-17T08:00:00.000Z');
const CREATOR_ID = 'creator-1';

function day(offset: number): Date {
  const date = new Date('2026-09-17T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

function row(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'content-1',
    name: 'Review Serum',
    type: 'evergreen',
    brief: '',
    deadline: day(10),
    status: 'scheduled',
    videoLink: null,
    platform: null,
    submissions: [],
    ...overrides,
  };
}

describe('toMyTask', () => {
  it('describes fresh content with only the draft action open', () => {
    expect(toMyTask(row(), TODAY)).toEqual({
      id: 'content-1',
      name: 'Review Serum',
      type: 'evergreen',
      brief: '',
      deadline: '2026-09-27',
      status: 'scheduled',
      daysUntilDeadline: 10,
      videoLink: null,
      platform: null,
      latestDraft: null,
      actions: {
        canSubmitDraft: true,
        isResubmission: false,
        canSubmitVideo: false,
        inGracePeriod: false,
      },
    });
  });

  it('marks a draft sent back for revision as a resubmission and shows the latest note', () => {
    const task = toMyTask(
      row({
        status: 'draft_revision',
        submissions: [
          {
            link: 'https://drive.example/v1',
            revisionNotes: null,
            createdAt: day(-4),
          },
          {
            link: 'https://drive.example/v2',
            revisionNotes: 'Hook kurang kuat',
            createdAt: day(-2),
          },
        ],
      }),
      TODAY,
    );

    expect(task.actions).toMatchObject({
      canSubmitDraft: true,
      isResubmission: true,
    });
    expect(task.latestDraft).toEqual({
      link: 'https://drive.example/v2',
      submittedAt: '2026-09-15',
      revisionNotes: 'Hook kurang kuat',
      revisionCount: 1,
    });
  });

  it('opens the video action for an approved draft', () => {
    expect(toMyTask(row({ status: 'draft_approved' }), TODAY).actions).toEqual({
      canSubmitDraft: false,
      isResubmission: false,
      canSubmitVideo: true,
      inGracePeriod: false,
    });
  });

  it('opens the video action in the grace window even without approval', () => {
    const task = toMyTask(
      row({ status: 'draft_review', deadline: day(1) }),
      TODAY,
    );

    expect(task.actions).toMatchObject({
      canSubmitVideo: true,
      inGracePeriod: true,
    });
  });

  it('closes everything once the link is in, even near the deadline', () => {
    const task = toMyTask(
      row({
        status: 'link_submitted',
        deadline: day(0),
        videoLink: 'https://www.tiktok.com/@a/video/1',
        platform: 'tiktok',
      }),
      TODAY,
    );

    expect(task.actions).toEqual({
      canSubmitDraft: false,
      isResubmission: false,
      canSubmitVideo: false,
      inGracePeriod: false,
    });
    expect(task.platform).toBe('tiktok');
  });
});

describe('MyTaskService.list', () => {
  function serviceWith(rows: TaskRow[], total = rows.length) {
    const findMany = vi.fn().mockResolvedValue(rows);
    const count = vi.fn().mockResolvedValue(total);
    const prisma = { content: { findMany, count } } as unknown as PrismaService;
    const clock: Clock = { now: () => TODAY };
    return { service: new MyTaskService(prisma, clock), findMany, count };
  }

  it("asks only for this creator's committed content, nearest deadline first, five at a time", async () => {
    const { service, findMany, count } = serviceWith([row()]);

    const result = await service.list(CREATOR_ID, {});

    const where = { isProposal: false, contract: { creatorId: CREATOR_ID } };
    expect(count).toHaveBeenCalledWith({ where });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ deadline: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 5,
      }),
    );
    expect(result).toMatchObject({
      page: 1,
      pageSize: 5,
      total: 1,
      totalPages: 1,
    });
    expect(result.items[0].id).toBe('content-1');
  });

  it('skips to the requested page', async () => {
    const { service, findMany } = serviceWith([row()], 12);

    const result = await service.list(CREATOR_ID, { page: 3 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 }),
    );
    expect(result).toMatchObject({ page: 3, total: 12, totalPages: 3 });
  });

  it('caps an oversized page and still reports one page when there is nothing', async () => {
    const { service, findMany } = serviceWith([], 0);

    const result = await service.list(CREATOR_ID, { pageSize: 500 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
    expect(result).toEqual({
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 1,
    });
  });
});
