import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SubmissionDetailService } from './submission-detail.service.js';
import { SubmissionReviewService } from './submission-review.service.js';
import { SubmissionsController } from './submissions.controller.js';

const SUBMISSION_ID = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';

describe('SubmissionsController', () => {
  const review = { approve: vi.fn() };
  const detail = { getDetail: vi.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SubmissionsController],
      providers: [
        { provide: SubmissionReviewService, useValue: review },
        { provide: SubmissionDetailService, useValue: detail },
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
