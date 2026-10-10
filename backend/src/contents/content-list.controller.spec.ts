import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminGuard } from '../auth/admin.guard.js';
import { ContentListController } from './content-list.controller.js';
import { ContentListService } from './content-list.service.js';
import type { ContentListResponse } from './dto/content-list.dto.js';

const CREATOR_A = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';
const CREATOR_B = '11111111-1111-4111-8111-111111111111';

const emptyList: ContentListResponse = {
  items: [],
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1,
  tabCounts: { all: 0, needs_approval: 0, waiting_creator: 0, done: 0 },
};

describe('ContentListController', () => {
  const contents = { list: vi.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ContentListController],
      providers: [{ provide: ContentListService, useValue: contents }],
    })
      // AdminGuard has its own spec; these tests are about the route behind it.
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    contents.list.mockReset();
    contents.list.mockResolvedValue(emptyList);
  });

  function get(query = '') {
    return request(app.getHttpServer()).get(`/contents${query}`);
  }

  it('is open to signed-in admins only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ContentListController)).toEqual(
      [AdminGuard],
    );
  });

  it('answers what the service lists', async () => {
    const list: ContentListResponse = {
      ...emptyList,
      items: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Unboxing Serum',
          creatorId: CREATOR_A,
          creatorName: 'Dina Putri',
          type: 'specific',
          deadline: '2026-10-21',
          status: 'draft_review',
          tags: ['overdue'],
          revisionCount: 1,
        },
      ],
      total: 1,
      tabCounts: { all: 1, needs_approval: 1, waiting_creator: 0, done: 0 },
    };
    contents.list.mockResolvedValue(list);

    const response = await get();

    expect(response.status).toBe(200);
    expect(response.body).toEqual(list);
  });

  it('lists every content, ten rows a page by nearest deadline, when nothing is asked', async () => {
    await get();

    expect(contents.list).toHaveBeenCalledWith(
      { page: 1, pageSize: 10 },
      expect.any(Date),
      { tab: 'all', sort: 'deadline_asc' },
    );
  });

  it('reads the clock per request so overdue is judged against today', async () => {
    const before = Date.now();

    await get();

    const now = contents.list.mock.calls[0][1] as Date;
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('passes the page and every checked filter to the service', async () => {
    await get(
      `?page=2&pageSize=20&tab=needs_approval&q=serum&creator=${CREATOR_A}` +
        '&type=specific&status=draft_review&overdue=true' +
        '&deadlineFrom=2026-10-01&deadlineTo=2026-10-31&sort=deadline_desc',
    );

    expect(contents.list).toHaveBeenCalledWith(
      { page: 2, pageSize: 20 },
      expect.any(Date),
      {
        tab: 'needs_approval',
        q: 'serum',
        creators: [CREATOR_A],
        types: ['specific'],
        statuses: ['draft_review'],
        overdue: true,
        deadlineFrom: '2026-10-01',
        deadlineTo: '2026-10-31',
        sort: 'deadline_desc',
      },
    );
  });

  it('reads a filter sent more than once as several values', async () => {
    await get(
      `?creator=${CREATOR_A}&creator=${CREATOR_B}` +
        '&type=evergreen&type=specific&status=pending&status=draft_review',
    );

    expect(contents.list.mock.calls[0][2]).toEqual({
      tab: 'all',
      creators: [CREATOR_A, CREATOR_B],
      types: ['evergreen', 'specific'],
      statuses: ['pending', 'draft_review'],
      sort: 'deadline_asc',
    });
  });

  it('never turns a bracketed key into a filter', async () => {
    // The query parser keeps `creator[id]` as a key of that literal name, so no object can be
    // built from the address; the list is simply not narrowed.
    const response = await get(`?creator[id]=${CREATOR_A}&status[$ne]=pending`);

    expect(response.status).toBe(200);
    expect(contents.list.mock.calls[0][2]).toEqual({
      tab: 'all',
      sort: 'deadline_asc',
    });
  });

  it.each([
    ['an unknown tab', '?tab=archived'],
    ['an unknown status', '?status=review'],
    ['one unknown status among known ones', '?status=pending&status=approved'],
    ['an unknown type', '?type=sponsored'],
    ['a creator that is not an id', '?creator=dina'],
    ['an unknown sort', '?sort=name_asc'],
    ['an overdue flag that is neither true nor false', '?overdue=yes'],
    ['a start day that does not exist', '?deadlineFrom=2026-02-30'],
    [
      'a period that ends before it starts',
      '?deadlineFrom=2026-10-11&deadlineTo=2026-10-10',
    ],
    ['a search sent twice', '?q=a&q=b'],
    ['a page that is not a number', '?page=two'],
    ['page zero', '?page=0'],
    ['a page size over the cap', '?pageSize=51'],
  ])('answers 400 for %s and never reaches the service', async (_, query) => {
    const response = await get(query);

    expect(response.status).toBe(400);
    expect(contents.list).not.toHaveBeenCalled();
  });
});
