import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SubmissionReviewService } from './submission-review.service.js';
import { SubmissionsController } from './submissions.controller.js';

const SUBMISSION_ID = '0f9c2f5e-6b1a-4f3e-9a51-3c1d2e4b5a60';

describe('PATCH /submissions/:id/approve', () => {
  const review = { approve: vi.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SubmissionsController],
      providers: [{ provide: SubmissionReviewService, useValue: review }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    review.approve.mockReset();
  });

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
