import {
  ConflictException,
  NotFoundException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  DEV_CREATOR_HEADER,
  DevCreatorGuard,
} from '../auth/dev-creator.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { VideoSubmissionController } from './video-submission.controller.js';
import { VideoSubmissionService } from './video-submission.service.js';

const CONTENT_ID = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';
const CREATOR_ID = '0b5e2c9a-6f3d-4e1b-8a7c-9d2f4e6a8b1c';
const LINK = 'https://www.instagram.com/reel/C8abc/';

describe('VideoSubmissionController', () => {
  const videos = {
    submit: vi.fn(),
  };

  const prisma = {
    creators: {
      findUnique: vi.fn(),
    },
  };

  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [VideoSubmissionController],
      providers: [
        { provide: VideoSubmissionService, useValue: videos },
        DevCreatorGuard,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    videos.submit.mockReset();
    prisma.creators.findUnique.mockResolvedValue({ id: CREATOR_ID });
    vi.stubEnv('DEV_AUTH_ENABLED', 'true');
    vi.stubEnv('DEV_CREATOR_ID', CREATOR_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function submit(
    body: unknown,
    id = CONTENT_ID,
    creator: string | null = CREATOR_ID,
  ) {
    const call = request(app.getHttpServer()).post(`/contents/${id}/video`);

    return (creator ? call.set(DEV_CREATOR_HEADER, creator) : call).send(
      body as object,
    );
  }

  it('passes the validated link to the service for the calling creator and answers 201', async () => {
    const submitted = {
      contentId: CONTENT_ID,
      status: 'link_submitted',
      videoLink: LINK,
      platform: 'instagram',
      submittedAt: '2026-10-19T00:00:00.000Z',
    };

    videos.submit.mockResolvedValue(submitted);

    const response = await submit({
      link: ` ${LINK} `,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(submitted);
    expect(videos.submit).toHaveBeenCalledWith(CONTENT_ID, CREATOR_ID, {
      videoLink: LINK,
    });
  });

  it('answers 201 when the creator is resolved from DEV_CREATOR_ID without a request header', async () => {
    const submitted = {
      contentId: CONTENT_ID,
      status: 'link_submitted',
      videoLink: LINK,
      platform: 'instagram',
      submittedAt: '2026-10-19T00:00:00.000Z',
    };

    videos.submit.mockResolvedValue(submitted);

    const response = await submit({ link: LINK }, CONTENT_ID, null);

    expect(response.status).toBe(201);
    expect(response.body).toEqual(submitted);
    expect(videos.submit).toHaveBeenCalledWith(CONTENT_ID, CREATOR_ID, {
      videoLink: LINK,
    });
  });

  it('answers 401 when no creator identity is supplied', async () => {
    vi.stubEnv('DEV_CREATOR_ID', '');

    const response = await submit({ link: LINK }, CONTENT_ID, '');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Silakan masuk terlebih dahulu',
    });
    expect(videos.submit).not.toHaveBeenCalled();
  });

  it('answers 400 for a malformed content id before reaching the service', async () => {
    const response = await submit({ link: LINK }, 'not-a-uuid');

    expect(response.status).toBe(400);
    expect(videos.submit).not.toHaveBeenCalled();
  });

  it('answers 422 for a missing video link before reaching the service', async () => {
    const response = await submit({});

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      message: 'Data link video tidak valid',
      errors: {
        videoLink: 'Link video wajib diisi',
      },
    });
    expect(videos.submit).not.toHaveBeenCalled();
  });

  it('answers 422 for an invalid video link before reaching the service', async () => {
    const response = await submit({
      link: 'javascript:alert(1)',
    });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      message: 'Data link video tidak valid',
      errors: {
        videoLink: 'Link video harus berupa URL http atau https',
      },
    });
    expect(videos.submit).not.toHaveBeenCalled();
  });

  it('answers 422 for a non-object request body before reaching the service', async () => {
    const response = await submit([]);

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      message: 'Data link video tidak valid',
      errors: {
        videoLink: 'Link video wajib diisi',
      },
    });
    expect(videos.submit).not.toHaveBeenCalled();
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
        code: 'VIDEO_NOT_ELIGIBLE',
        message:
          'Link video hanya bisa dikirim setelah draft disetujui atau mulai H-1',
      }),
    ],
  ])(
    'passes the service %i response through unchanged',
    async (status, error) => {
      videos.submit.mockRejectedValue(error);

      const response = await submit({ link: LINK });

      expect(response.status).toBe(status);
      expect(response.body).toEqual(error.getResponse());
    },
  );

  it('rejects production use of the development identity header', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await submit({ link: LINK });

    expect(response.status).toBe(401);
    expect(videos.submit).not.toHaveBeenCalled();
  });
});
