import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ReviewQueueService } from './review-queue.service.js';
import { SubmissionDetailService } from './submission-detail.service.js';
import { SubmissionReviewService } from './submission-review.service.js';
import { SubmissionsController } from './submissions.controller.js';

const SUBMISSION_ID = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';

describe('SubmissionsController', () => {
  const review = { approve: vi.fn() };
  const detail = { getDetail: vi.fn() };
  const queue = { list: vi.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SubmissionsController],
      providers: [
        { provide: SubmissionReviewService, useValue: review },
        { provide: SubmissionDetailService, useValue: detail },
        { provide: ReviewQueueService, useValue: queue },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    review.approve.mockReset();
    detail.getDetail.mockReset();
    queue.list.mockReset();
  });

  describe('GET /submissions?status=review', () => {
    const emptyQueue = {
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
    };

    function getQueue(query: string) {
      return request(app.getHttpServer()).get(`/submissions?${query}`);
    }

    it('answers the queue with ten rows per page and no filters by default', async () => {
      queue.list.mockResolvedValue(emptyQueue);

      const response = await getQueue('status=review');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(emptyQueue);
      expect(queue.list).toHaveBeenCalledWith(
        { page: 1, pageSize: 10 },
        expect.any(Date),
        {},
      );
    });

    it('passes the page and every checked filter to the service', async () => {
      queue.list.mockResolvedValue(emptyQueue);

      const response = await getQueue(
        'status=review&q=%20dina%20&type=evergreen&filterStatus=draft_revised&overdue=true&page=2',
      );

      expect(response.status).toBe(200);
      expect(queue.list).toHaveBeenCalledWith(
        { page: 2, pageSize: 10 },
        expect.any(Date),
        {
          q: 'dina',
          type: 'evergreen',
          status: 'draft_revised',
          overdue: true,
        },
      );
    });

    it('reads the clock per request so overdue is judged against today', async () => {
      queue.list.mockResolvedValue(emptyQueue);
      const before = Date.now();

      await getQueue('status=review');

      const today = queue.list.mock.calls[0][1] as Date;
      expect(today.getTime()).toBeGreaterThanOrEqual(before);
      expect(today.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it.each([
      ['status is missing', ''],
      ['status is not review', 'status=approved'],
      ['type is unknown', 'status=review&type=Evergreen'],
      [
        'filterStatus is outside the queue',
        'status=review&filterStatus=draft_revision',
      ],
      ['overdue is not a boolean', 'status=review&overdue=yes'],
      ['the search is too long', `status=review&q=${'a'.repeat(101)}`],
      ['page is zero', 'status=review&page=0'],
      ['page is not a number', 'status=review&page=abc'],
      ['pageSize is over the cap', 'status=review&pageSize=51'],
    ])(
      'answers 400 when %s, without reaching the service',
      async (_, query) => {
        const response = await getQueue(query);

        expect(response.status).toBe(400);
        expect(queue.list).not.toHaveBeenCalled();
      },
    );
  });

  describe('PATCH /submissions/:id/approve', () => {
    it('approves the submission and answers 200 with the new status', async () => {
      const approved = {
        id: SUBMISSION_ID,
        contentId: 'a08576d2-15a7-4ed0-bf4b-f5a28c2d65a0',
        status: 'draft_approved',
      };
      review.approve.mockResolvedValue(approved);

      const response = await request(app.getHttpServer()).patch(
        `/submissions/${SUBMISSION_ID}/approve`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(approved);
      expect(review.approve).toHaveBeenCalledWith(SUBMISSION_ID);
    });

    it.each([
      ['a word', 'abc'],
      ['an injection attempt', "1' OR '1'='1"],
      ['a UUID with trailing text', `${SUBMISSION_ID}x`],
    ])('answers 400 for %s without reaching the service', async (_, id) => {
      const response = await request(app.getHttpServer()).patch(
        `/submissions/${encodeURIComponent(id)}/approve`,
      );

      expect(response.status).toBe(400);
      expect(review.approve).not.toHaveBeenCalled();
    });

    it('does not accept approval over GET', async () => {
      const response = await request(app.getHttpServer()).get(
        `/submissions/${SUBMISSION_ID}/approve`,
      );

      expect(response.status).toBe(404);
      expect(review.approve).not.toHaveBeenCalled();
    });
  });

  describe('GET /submissions/:id', () => {
    it('returns the submission detail with revision history', async () => {
      const detailData = {
        brief: 'Create a short product review',
        link: 'https://drive.example.com/draft-1',
        status: 'draft_revised',
        revisionHistory: [
          {
            note: null,
            date: '2026-09-01T00:00:00.000Z',
          },
          {
            note: 'Tolong ubah opening',
            date: '2026-09-05T00:00:00.000Z',
          },
        ],
      };

      detail.getDetail.mockResolvedValue(detailData);

      const response = await request(app.getHttpServer()).get(
        `/submissions/${SUBMISSION_ID}`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(detailData);
      expect(detail.getDetail).toHaveBeenCalledWith(SUBMISSION_ID);
    });

    it.each([
      ['a word', 'abc'],
      ['an injection attempt', "1' OR '1'='1"],
      ['a UUID with trailing text', `${SUBMISSION_ID}x`],
    ])('answers 400 for %s without reaching the service', async (_, id) => {
      const response = await request(app.getHttpServer()).get(
        `/submissions/${encodeURIComponent(id)}`,
      );

      expect(response.status).toBe(400);
      expect(detail.getDetail).not.toHaveBeenCalled();
    });
  });
});
