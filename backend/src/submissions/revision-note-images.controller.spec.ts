import {
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import { CreatorOrAdminGuard } from '../auth/creator-or-admin.guard.js';
import { IMAGE_MAX_BYTES } from './revision-note-image-file.js';
import { RevisionNoteImagesController } from './revision-note-images.controller.js';
import { RevisionNoteImagesService } from './revision-note-images.service.js';

const SUBMISSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const IMAGE_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN = '44444444-4444-4444-8444-444444444444';
const CREATOR_ID = '660e8400-e29b-41d4-a716-446655440000';

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const INVALID = {
  code: 'IMAGE_TYPE',
  message: 'Format harus JPG, PNG, atau WebP',
};
const TOO_LARGE = {
  code: 'IMAGE_TOO_LARGE',
  message: 'Ukuran maksimal 5 MB',
};

/** A buffer of exactly `size` bytes that starts with `head`. */
function sized(head: Buffer, size: number): Buffer {
  const bytes = Buffer.alloc(size);
  head.copy(bytes);
  return bytes;
}

describe('RevisionNoteImagesController', () => {
  it('guards each route with the guard its side needs', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        RevisionNoteImagesController.prototype.upload,
      ),
    ).toEqual([AdminGuard]);
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        RevisionNoteImagesController.prototype.remove,
      ),
    ).toEqual([AdminGuard]);
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        RevisionNoteImagesController.prototype.open,
      ),
    ).toEqual([CreatorOrAdminGuard]);
  });

  const images = { upload: vi.fn(), remove: vi.fn(), open: vi.fn() };
  // Who the guards resolved; null plays a guard that let a request through unsigned.
  let principal: AdminRequest['principal'] | null;
  let creatorId: string | undefined;
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [RevisionNoteImagesController],
      providers: [
        { provide: RevisionNoteImagesService, useValue: images },
      ],
    })
      .overrideGuard(AdminGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<AdminRequest>();
          if (principal) req.principal = principal;
          return true;
        },
      })
      .overrideGuard(CreatorOrAdminGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context
            .switchToHttp()
            .getRequest<AdminRequest & { creatorId?: string }>();
          if (creatorId !== undefined) req.creatorId = creatorId;
          if (principal) req.principal = principal;
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    principal = { userId: ADMIN, role: 'admin' };
    creatorId = undefined;
    images.upload.mockResolvedValue({
      id: IMAGE_ID,
      url: `/api/revision-note-images/${IMAGE_ID}`,
      contentType: 'image/png',
      sizeBytes: 42,
      createdAt: '2026-11-06T03:00:00.000Z',
    });
  });

  function upload() {
    return request(app.getHttpServer()).post(
      `/submissions/${SUBMISSION_ID}/revision-note-images`,
    );
  }

  describe('POST /submissions/:id/revision-note-images', () => {
    it('hands the service the bytes, the type their marks prove and the signed-in admin', async () => {
      const res = await upload().attach('file', PNG_HEAD, 'layar.png');

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: IMAGE_ID,
        url: `/api/revision-note-images/${IMAGE_ID}`,
        contentType: 'image/png',
        sizeBytes: 42,
        createdAt: '2026-11-06T03:00:00.000Z',
      });
      expect(images.upload).toHaveBeenCalledExactlyOnceWith(
        SUBMISSION_ID,
        {
          bytes: PNG_HEAD,
          contentType: 'image/png',
          fileName: 'layar.png',
        },
        ADMIN,
      );
    });

    // busboy counts its limits inclusively, so the interceptor allows one byte over and the
    // check refuses it in the admin's own words (AC 4).
    it('takes exactly 5 MB and refuses one byte more in its own words (off by one)', async () => {
      const exact = await upload().attach(
        'file',
        sized(PNG_HEAD, IMAGE_MAX_BYTES),
        'a.png',
      );
      const over = await upload().attach(
        'file',
        sized(PNG_HEAD, IMAGE_MAX_BYTES + 1),
        'b.png',
      );

      expect(exact.status).toBe(201);
      expect(over.status).toBe(422);
      expect(over.body).toEqual(TOO_LARGE);
      expect(images.upload).toHaveBeenCalledTimes(1);
    });

    // OWASP Top 10:2025 A06 (Insecure Design): every way the form can be wrong is a 422 in
    // the admin's words, never Nest's raw 400/413, and never reaches the service (AC 4).
    it.each([
      ['no file', (call: request.Test) => call],
      [
        'a body that is not multipart',
        (call: request.Test) => call.send({ file: 'x' }),
      ],
      [
        'two files',
        (call: request.Test) =>
          call.attach('file', PNG_HEAD, 'a.png').attach('file', PNG_HEAD, 'b.png'),
      ],
      [
        'another field name',
        (call: request.Test) => call.attach('gambar', PNG_HEAD, 'a.png'),
      ],
      [
        'a forged text field',
        (call: request.Test) =>
          call.field('uploadedBy', 'x').attach('file', PNG_HEAD, 'a.png'),
      ],
      [
        'a program renamed .png',
        (call: request.Test) =>
          call.attach('file', Buffer.from('MZ\x90\x00'), {
            filename: 'a.png',
            contentType: 'image/png',
          }),
      ],
    ])('refuses %s with the format reason', async (_case, build) => {
      const res = await build(upload());

      expect(res.status).toBe(422);
      expect(res.body).toEqual(INVALID);
      expect(images.upload).not.toHaveBeenCalled();
    });

    it('refuses a caller no guard signed in', async () => {
      principal = null;

      const res = await upload().attach('file', PNG_HEAD, 'layar.png');

      expect(res.status).toBe(401);
      expect(images.upload).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /submissions/:id/revision-note-images/:imageId', () => {
    it('takes the screenshot off the note for the admin', async () => {
      images.remove.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer()).delete(
        `/submissions/${SUBMISSION_ID}/revision-note-images/${IMAGE_ID}`,
      );

      expect(res.status).toBe(200);
      expect(images.remove).toHaveBeenCalledExactlyOnceWith(
        SUBMISSION_ID,
        IMAGE_ID,
      );
    });
  });

  describe('GET /submissions/:id/revision-note-images/:imageId', () => {
    it('answers with the short-lived link behind the open route (AC 6)', async () => {
      images.open.mockResolvedValue({
        kind: 'redirect',
        url: 'https://signed.example/layar.png',
      });

      const res = await request(app.getHttpServer()).get(
        `/submissions/${SUBMISSION_ID}/revision-note-images/${IMAGE_ID}`,
      );

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://signed.example/layar.png');
      expect(images.open).toHaveBeenCalledExactlyOnceWith(
        SUBMISSION_ID,
        IMAGE_ID,
        {},
      );
    });

    it('passes the creator the guard resolved, so the service narrows them to their content (AC 6)', async () => {
      principal = null;
      creatorId = CREATOR_ID;
      images.open.mockResolvedValue({
        kind: 'redirect',
        url: 'https://signed.example/layar.png',
      });

      await request(app.getHttpServer())
        .get(`/submissions/${SUBMISSION_ID}/revision-note-images/${IMAGE_ID}`)
        .expect(302);

      expect(images.open).toHaveBeenCalledExactlyOnceWith(
        SUBMISSION_ID,
        IMAGE_ID,
        { creatorId: CREATOR_ID },
      );
    });
  });
});
