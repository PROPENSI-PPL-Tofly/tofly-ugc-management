import {
  NotFoundException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminGuard } from '../auth/admin.guard.js';
import { ContentDetailService } from './content-detail.service.js';
import { ContentEventHistoryService } from './content-event-history.service.js';
import { ContentsController } from './contents.controller.js';
import { ContentCreationService } from './contents.service.js';

const CONTENT_ID = 'a08576d2-15a7-4ed0-bf4b-f5a28c2d65a0';
const OTHER_CONTENT_ID = 'b08576d2-15a7-4ed0-bf4b-f5a28c2d65a0';
const EVENT_ID_1 = '00000000-0000-4000-8000-000000000001';
const EVENT_ID_2 = '00000000-0000-4000-8000-000000000002';
const EVENT_ID_3 = '00000000-0000-4000-8000-000000000003';
const OCCURRED_AT = new Date('2026-10-01T10:00:00.000Z');
const NEWEST_AT = new Date('2026-10-03T10:00:00.000Z');

interface TimelineEvent {
  id: string;
  contentId: string;
  eventType: string;
  actorName: string;
  actorRole: 'admin' | 'creator';
  occurredAt: Date;
  eventData: Record<string, unknown>;
}

const timelineEvents: TimelineEvent[] = [
  {
    id: EVENT_ID_1,
    contentId: CONTENT_ID,
    eventType: 'Draft Submitted',
    actorName: 'Dina Creator',
    actorRole: 'creator',
    occurredAt: OCCURRED_AT,
    eventData: { version: 2, link: 'https://drive.example.com/draft-2' },
  },
  {
    id: EVENT_ID_2,
    contentId: CONTENT_ID,
    eventType: 'Creator Comment',
    actorName: 'Dina Creator',
    actorRole: 'creator',
    occurredAt: OCCURRED_AT,
    eventData: { comment: 'I added the requested detail.' },
  },
  {
    id: EVENT_ID_3,
    contentId: CONTENT_ID,
    eventType: 'Draft Approved',
    actorName: 'Ayu Admin',
    actorRole: 'admin',
    occurredAt: NEWEST_AT,
    eventData: {},
  },
  {
    id: 'c08576d2-15a7-4ed0-bf4b-f5a28c2d65a0',
    contentId: OTHER_CONTENT_ID,
    eventType: 'Scheduled',
    actorName: 'Ayu Admin',
    actorRole: 'admin',
    occurredAt: new Date('2026-10-02T10:00:00.000Z'),
    eventData: {},
  },
];

describe('GET /contents/:id/events', () => {
  const history = { getForContent: vi.fn() };
  const creation = { create: vi.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ContentsController],
      providers: [
        { provide: ContentCreationService, useValue: creation },
        { provide: ContentDetailService, useValue: { getDetail: vi.fn() } },
        { provide: ContentEventHistoryService, useValue: history },
      ],
    })
      // The route's authentication contract is tested at its guard boundary.
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
    history.getForContent.mockReset();
    history.getForContent.mockImplementation(async (contentId: string) =>
      timelineEvents
        .filter((event) => event.contentId === contentId)
        .sort(
          (left, right) =>
            right.occurredAt.getTime() - left.occurredAt.getTime() ||
            right.id.localeCompare(left.id),
        ),
    );
  });

  it('returns only the requested content events with all timeline fields newest first', async () => {
    const response = await request(app.getHttpServer())
      .get(`/contents/${CONTENT_ID}/events`)
      .expect(200);

    expect(history.getForContent).toHaveBeenCalledWith(CONTENT_ID);
    expect(response.body).toEqual([
      {
        id: EVENT_ID_3,
        contentId: CONTENT_ID,
        eventType: 'Draft Approved',
        actorName: 'Ayu Admin',
        actorRole: 'admin',
        occurredAt: NEWEST_AT.toISOString(),
        eventData: {},
      },
      {
        id: EVENT_ID_2,
        contentId: CONTENT_ID,
        eventType: 'Creator Comment',
        actorName: 'Dina Creator',
        actorRole: 'creator',
        occurredAt: OCCURRED_AT.toISOString(),
        eventData: { comment: 'I added the requested detail.' },
      },
      {
        id: EVENT_ID_1,
        contentId: CONTENT_ID,
        eventType: 'Draft Submitted',
        actorName: 'Dina Creator',
        actorRole: 'creator',
        occurredAt: OCCURRED_AT.toISOString(),
        eventData: {
          version: 2,
          link: 'https://drive.example.com/draft-2',
        },
      },
    ]);
  });

  it('returns an empty list for a content item with no events', async () => {
    history.getForContent.mockResolvedValueOnce([]);

    const response = await request(app.getHttpServer())
      .get(`/contents/${OTHER_CONTENT_ID}/events`)
      .expect(200);

    expect(response.body).toEqual([]);
    expect(history.getForContent).toHaveBeenCalledWith(OTHER_CONTENT_ID);
  });

  it('answers 400 for a malformed content id before querying event history', async () => {
    await request(app.getHttpServer())
      .get('/contents/not-a-uuid/events')
      .expect(400);

    expect(history.getForContent).not.toHaveBeenCalled();
  });

  it('passes a missing content response through as 404', async () => {
    const missing = new NotFoundException({
      code: 'CONTENT_NOT_FOUND',
      message: 'Konten tidak ditemukan',
    });
    history.getForContent.mockRejectedValueOnce(missing);

    const response = await request(app.getHttpServer())
      .get(`/contents/${CONTENT_ID}/events`)
      .expect(404);

    expect(response.body).toEqual(missing.getResponse());
    expect(history.getForContent).toHaveBeenCalledWith(CONTENT_ID);
  });
});
