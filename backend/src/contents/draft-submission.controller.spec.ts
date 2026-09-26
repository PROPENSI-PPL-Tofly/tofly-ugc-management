import {
  ConflictException,
  NotFoundException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MOCK_CREATOR_HEADER } from './creator-identity.mock.js';
import { DraftSubmissionController } from './draft-submission.controller.js';
import { DraftSubmissionService } from './draft-submission.service.js';

const CONTENT_ID = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';
const CREATOR_ID = '0b5e2c9a-6f3d-4e1b-8a7c-9d2f4e6a8b1c';
const LINK = 'https://drive.google.com/d/1';

describe('DraftSubmissionController', () => {
  const drafts = { submit: vi.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DraftSubmissionController],
      providers: [{ provide: DraftSubmissionService, useValue: drafts }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    drafts.submit.mockReset();
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function handIn(body: unknown, id = CONTENT_ID, creator = CREATOR_ID) {
    const call = request(app.getHttpServer()).post(`/contents/${id}/draft`);
    return (creator ? call.set(MOCK_CREATOR_HEADER, creator) : call).send(
      body as object,
    );
  }

  it('hands the checked draft to the service for the calling creator and answers 201', async () => {
    const submitted = {
      contentId: CONTENT_ID,
      submissionId: 'sub-1',
      status: 'draft_review',
      link: LINK,
      notes: 'Catatan',
      submittedAt: '2026-10-02T03:04:05.000Z',
    };
    drafts.submit.mockResolvedValue(submitted);

    const response = await handIn({ link: ` ${LINK} `, notes: ' Catatan ' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(submitted);
    expect(drafts.submit).toHaveBeenCalledWith(CONTENT_ID, CREATOR_ID, {
      link: LINK,
      notes: 'Catatan',
    });
  });

  it('answers 401 to a caller who names no creator, before looking at anything else (OWASP A01)', async () => {
    const response = await handIn({ link: LINK }, 'not-a-uuid', '');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Silakan masuk terlebih dahulu',
    });
    expect(drafts.submit).not.toHaveBeenCalled();
  });

  it('answers 400 to a malformed content id without reaching the service', async () => {
    const response = await handIn({ link: LINK }, 'not-a-uuid');

    expect(response.status).toBe(400);
    expect(drafts.submit).not.toHaveBeenCalled();
  });

  it('answers 422 to a bad link without reaching the service (OWASP A03)', async () => {
    const response = await handIn({ link: 'javascript:alert(1)' });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      message: 'Data draft tidak valid',
      errors: { link: 'Link draft harus berupa URL http atau https' },
    });
    expect(drafts.submit).not.toHaveBeenCalled();
  });

  it.each([
    [
      404,
      new NotFoundException({
        code: 'CONTENT_NOT_FOUND',
        message: 'Konten tidak ditemukan',
      }),
    ],
    [
      409,
      new ConflictException({
        code: 'DRAFT_NOT_ELIGIBLE',
        message: 'Konten ini sedang tidak menerima draft',
      }),
    ],
  ])('passes the service’s %i through', async (status, error) => {
    drafts.submit.mockRejectedValue(error);

    const response = await handIn({ link: LINK });

    expect(response.status).toBe(status);
    expect(response.body).toEqual(error.getResponse());
  });
});
