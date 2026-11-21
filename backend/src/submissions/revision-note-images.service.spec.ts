import { NotFoundException } from '@nestjs/common';
import type { CheckedNoteImage } from './revision-note-image-file.js';
import { RevisionNoteImagesService } from './revision-note-images.service.js';

const SUBMISSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const CONTENT_CREATOR_ID = '660e8400-e29b-41d4-a716-446655440000';
const ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
const IMAGE_ID = '22222222-2222-4222-8222-222222222222';
const OBJECT_KEY = '33333333-3333-4333-8333-333333333333';

const IMAGE: CheckedNoteImage = {
  bytes: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
  contentType: 'image/jpeg',
  fileName: 'layar.jpg',
};

function store() {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    open: vi.fn().mockResolvedValue({
      kind: 'redirect',
      url: 'https://signed.example/layar.jpg',
    }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

/** The content a draft belongs to: what it waits on, and the newest draft it holds. */
function content(status: string, latest = SUBMISSION_ID) {
  return { status, submissions: [{ id: latest }] };
}

function client(overrides: Record<string, unknown> = {}) {
  const prisma = {
    submissions: {
      findUnique: vi.fn().mockResolvedValue({
        id: SUBMISSION_ID,
        revision_notes: null,
        contents: content('draft_review'),
      }),
    },
    revision_note_images: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({
        id: IMAGE_ID,
        object_key: OBJECT_KEY,
        file_name: IMAGE.fileName,
        content_type: IMAGE.contentType,
        size_bytes: IMAGE.bytes.length,
        created_at: new Date('2026-11-06T03:00:00.000Z'),
      }),
      findFirst: vi.fn().mockResolvedValue({
        object_key: OBJECT_KEY,
        file_name: IMAGE.fileName,
        content_type: IMAGE.contentType,
      }),
      findUnique: vi.fn().mockResolvedValue({
        object_key: OBJECT_KEY,
        file_name: IMAGE.fileName,
        content_type: IMAGE.contentType,
        sent_at: null,
      }),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(),
    ...overrides,
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  return prisma;
}

function service(
  prisma: ReturnType<typeof client>,
  files: ReturnType<typeof store>,
  newObjectKey = () => OBJECT_KEY,
) {
  return new RevisionNoteImagesService(prisma, files, newObjectKey);
}

describe('RevisionNoteImagesService.upload', () => {
  it('stores the bytes in the private bucket and records the image on the note (AC 3)', async () => {
    const files = store();
    const prisma = client();

    const result = await service(prisma, files).upload(
      SUBMISSION_ID,
      IMAGE,
      ADMIN_USER_ID,
    );

    expect(files.put).toHaveBeenCalledExactlyOnceWith(
      `revision-note-images/${OBJECT_KEY}`,
      IMAGE.bytes,
      'image/jpeg',
    );
    expect(prisma.revision_note_images.create).toHaveBeenCalledExactlyOnceWith({
      data: {
        submission_id: SUBMISSION_ID,
        object_key: OBJECT_KEY,
        file_name: 'layar.jpg',
        content_type: 'image/jpeg',
        size_bytes: IMAGE.bytes.length,
        uploaded_by: ADMIN_USER_ID,
      },
      select: { id: true, created_at: true },
    });
    expect(result).toEqual({
      id: IMAGE_ID,
      url: `/api/revision-note-images/${IMAGE_ID}`,
      contentType: 'image/jpeg',
      sizeBytes: IMAGE.bytes.length,
      createdAt: '2026-11-06T03:00:00.000Z',
      sent: false,
    });
    expect(prisma.$transaction).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' },
    );
  });

  // A note that has gone out belongs to the history, so no more images go on it; but while its
  // round is open a follow-up may still be written, and it takes screenshots of its own.
  describe('once the note has been sent', () => {
    function sentNote(status: string, latest = SUBMISSION_ID) {
      return client({
        submissions: {
          findUnique: vi.fn().mockResolvedValue({
            id: SUBMISSION_ID,
            revision_notes: 'Mohon perbaiki bagian pembuka.',
            contents: content(status, latest),
          }),
        },
      });
    }

    it('takes an image for a follow-up while the round is open, on the latest draft', async () => {
      const files = store();
      const prisma = sentNote('draft_revision');

      await expect(
        service(prisma, files).upload(SUBMISSION_ID, IMAGE, ADMIN_USER_ID),
      ).resolves.toMatchObject({ id: IMAGE_ID, sent: false });
      expect(files.put).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['the content is no longer waiting on the revision', 'draft_review', SUBMISSION_ID],
      [
        'the creator has answered with a newer draft',
        'draft_revision',
        '99999999-9999-4999-8999-999999999999',
      ],
    ])('refuses an upload when %s (review)', async (_why, status, latest) => {
      const files = store();

      await expect(
        service(sentNote(status, latest), files).upload(SUBMISSION_ID, IMAGE, ADMIN_USER_ID),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          code: 'NOTE_SENT',
          message: 'Catatan revisi sudah dikirim',
        },
      });
      expect(files.put).not.toHaveBeenCalled();
    });
  });

  // The five a note may hold are the ones still to go out: the images already sent with the
  // revision note do not use up a follow-up's room.
  it('counts only the images not yet sent against the five (follow-ups)', async () => {
    const prisma = client();

    await service(prisma, store()).upload(SUBMISSION_ID, IMAGE, ADMIN_USER_ID);

    expect(prisma.revision_note_images.count).toHaveBeenCalledTimes(2);
    for (const call of prisma.revision_note_images.count.mock.calls) {
      expect(call[0]).toEqual({
        where: { submission_id: SUBMISSION_ID, sent_at: null },
      });
    }
  });

  it('counts again when two uploads collide in the serializable transaction (review)', async () => {
    const { Prisma } = await import('@prisma/client');
    const collision = new Prisma.PrismaClientKnownRequestError(
      'Serialization failure',
      { code: 'P2034', clientVersion: 'test' },
    );
    const files = store();
    const prisma = client();
    const create = prisma.revision_note_images.create;
    create.mockRejectedValueOnce(collision);

    const result = await service(prisma, files).upload(
      SUBMISSION_ID,
      IMAGE,
      ADMIN_USER_ID,
    );

    expect(result.id).toBe(IMAGE_ID);
    expect(create).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  // PBI-34 AC 3: "Tambah Gambar" takes several files at once, and up to five uploads may count
  // at the same moment. Each recount can lose to another upload once, so one retry is not enough.
  it('keeps counting again while uploads picked together still collide', async () => {
    const { Prisma } = await import('@prisma/client');
    const collision = new Prisma.PrismaClientKnownRequestError(
      'Serialization failure',
      { code: 'P2034', clientVersion: 'test' },
    );
    const files = store();
    const prisma = client();
    const create = prisma.revision_note_images.create;
    create
      .mockRejectedValueOnce(collision)
      .mockRejectedValueOnce(collision)
      .mockRejectedValueOnce(collision);

    const result = await service(prisma, files).upload(
      SUBMISSION_ID,
      IMAGE,
      ADMIN_USER_ID,
    );

    expect(result.id).toBe(IMAGE_ID);
    expect(create).toHaveBeenCalledTimes(4);
    expect(files.remove).not.toHaveBeenCalled();
  });

  it('cleans the bytes up when even the recount collides (review)', async () => {
    const { Prisma } = await import('@prisma/client');
    const collision = new Prisma.PrismaClientKnownRequestError(
      'Serialization failure',
      { code: 'P2034', clientVersion: 'test' },
    );
    const files = store();
    const prisma = client();
    prisma.revision_note_images.create.mockRejectedValue(collision);

    await expect(
      service(prisma, files).upload(SUBMISSION_ID, IMAGE, ADMIN_USER_ID),
    ).rejects.toBe(collision);
    expect(files.remove).toHaveBeenCalledExactlyOnceWith(
      `revision-note-images/${OBJECT_KEY}`,
    );
  });

  it('refuses a sixth image that arrived while this one was uploading (review)', async () => {
    const files = store();
    const prisma = client();
    // The pre-check sees room; the count inside the transaction does not.
    prisma.revision_note_images.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(5);

    await expect(
      service(prisma, files).upload(SUBMISSION_ID, IMAGE, ADMIN_USER_ID),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'IMAGE_LIMIT', message: 'Maksimal 5 gambar per catatan' },
    });
    expect(files.remove).toHaveBeenCalledExactlyOnceWith(
      `revision-note-images/${OBJECT_KEY}`,
    );
  });

  it('refuses a sixth screenshot for one note with its own reason (AC 4)', async () => {
    const files = store();
    const prisma = client({
      revision_note_images: {
        count: vi.fn().mockResolvedValue(5),
        create: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
    });

    await expect(
      service(prisma, files).upload(SUBMISSION_ID, IMAGE, ADMIN_USER_ID),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'IMAGE_LIMIT', message: 'Maksimal 5 gambar per catatan' },
    });
    expect(files.put).not.toHaveBeenCalled();
    expect(prisma.revision_note_images.create).not.toHaveBeenCalled();
  });

  it('refuses an upload for a submission that does not exist', async () => {
    const prisma = client({
      submissions: { findUnique: vi.fn().mockResolvedValue(null) },
    });

    await expect(
      service(prisma, store()).upload(SUBMISSION_ID, IMAGE, ADMIN_USER_ID),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'SUBMISSION_NOT_FOUND' },
    });
  });

  it('answers a bucket that will not take the file with its own reason', async () => {
    const files = store();
    files.put.mockRejectedValue(new Error('bucket down'));

    await expect(
      service(client(), files).upload(SUBMISSION_ID, IMAGE, ADMIN_USER_ID),
    ).rejects.toMatchObject({
      status: 503,
      response: {
        code: 'IMAGE_STORAGE_UNAVAILABLE',
        message: 'Gambar gagal disimpan. Coba lagi.',
      },
    });
  });

  it('removes the bytes again when the record cannot be written', async () => {
    const files = store();
    const prisma = client({
      revision_note_images: {
        count: vi.fn().mockResolvedValue(1),
        create: vi.fn().mockRejectedValue(new Error('db down')),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
    });

    await expect(
      service(prisma, files).upload(SUBMISSION_ID, IMAGE, ADMIN_USER_ID),
    ).rejects.toThrow('db down');
    expect(files.remove).toHaveBeenCalledExactlyOnceWith(
      `revision-note-images/${OBJECT_KEY}`,
    );
  });
});

describe('RevisionNoteImagesService.remove', () => {
  it('removes a screenshot and its bytes (AC 5)', async () => {
    const files = store();
    const prisma = client();

    await service(prisma, files).remove(SUBMISSION_ID, IMAGE_ID);

    expect(prisma.revision_note_images.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { id: IMAGE_ID, submission_id: SUBMISSION_ID },
      select: { object_key: true, sent_at: true },
    });
    expect(prisma.revision_note_images.delete).toHaveBeenCalledExactlyOnceWith({
      where: { id: IMAGE_ID },
    });
    expect(files.remove).toHaveBeenCalledExactlyOnceWith(
      `revision-note-images/${OBJECT_KEY}`,
    );
  });

  it('refuses to take down an image the sent note holds, so its history cannot 404 (review)', async () => {
    const files = store();
    const prisma = client({
      revision_note_images: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({
          object_key: OBJECT_KEY,
          file_name: IMAGE.fileName,
          content_type: IMAGE.contentType,
          sent_at: new Date('2026-11-06T04:00:00.000Z'),
        }),
        delete: vi.fn(),
      },
    });

    await expect(
      service(prisma, files).remove(SUBMISSION_ID, IMAGE_ID),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'NOTE_SENT',
        message: 'Catatan revisi sudah dikirim',
      },
    });
    expect(files.remove).not.toHaveBeenCalled();
    expect(prisma.revision_note_images.delete).not.toHaveBeenCalled();
  });

  it('refuses to remove a screenshot of another note (OWASP A01)', async () => {
    const files = store();
    const prisma = client({
      revision_note_images: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      },
    });

    await expect(
      service(prisma, files).remove(SUBMISSION_ID, IMAGE_ID),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'IMAGE_NOT_FOUND', message: 'Gambar tidak ditemukan' },
    });
    expect(files.remove).not.toHaveBeenCalled();
  });
});

describe('RevisionNoteImagesService.open', () => {
  it('opens a screenshot for an admin through its short-lived link (AC 6)', async () => {
    const files = store();
    const prisma = client();

    await expect(service(prisma, files).open(IMAGE_ID, {})).resolves.toEqual({
      kind: 'redirect',
      url: 'https://signed.example/layar.jpg',
    });
    expect(files.open).toHaveBeenCalledExactlyOnceWith(
      `revision-note-images/${OBJECT_KEY}`,
      { fileName: 'layar.jpg', contentType: 'image/jpeg' },
    );
    expect(prisma.revision_note_images.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { id: IMAGE_ID },
      select: { object_key: true, file_name: true, content_type: true },
    });
  });

  it('narrows a creator to screenshots of their own content (AC 6)', async () => {
    const prisma = client();
    const files = store();

    await service(prisma, files).open(IMAGE_ID, {
      creatorId: CONTENT_CREATOR_ID,
    });

    expect(prisma.revision_note_images.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: IMAGE_ID,
        submissions: {
          contents: { contracts: { creator_id: CONTENT_CREATOR_ID } },
        },
      },
      select: { object_key: true, file_name: true, content_type: true },
    });
  });

  it("refuses another creator's screenshot as not found (AC 6)", async () => {
    const prisma = client({
      revision_note_images: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
    });

    await expect(
      service(prisma, store()).open(IMAGE_ID, {
        creatorId: CONTENT_CREATOR_ID,
      }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'IMAGE_NOT_FOUND', message: 'Gambar tidak ditemukan' },
    });
  });

  it('answers 404 when the bucket has nothing under the key', async () => {
    const files = store();
    files.open.mockResolvedValue(null);

    await expect(service(client(), files).open(IMAGE_ID, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(files.open).toHaveBeenCalledOnce();
  });
});

describe('RevisionNoteImagesService.list', () => {
  it("lists a note's images in the order they were uploaded, saying which are already sent (review)", async () => {
    const prisma = client();
    prisma.revision_note_images.findMany.mockResolvedValue([
      {
        id: IMAGE_ID,
        content_type: 'image/png',
        size_bytes: 42,
        created_at: new Date('2026-11-06T03:00:00.000Z'),
        sent_at: null,
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        content_type: 'image/webp',
        size_bytes: 7,
        created_at: new Date('2026-11-06T03:05:00.000Z'),
        sent_at: new Date('2026-11-06T04:00:00.000Z'),
      },
    ]);

    await expect(service(prisma, store()).list(SUBMISSION_ID)).resolves.toEqual([
      {
        id: IMAGE_ID,
        url: `/api/revision-note-images/${IMAGE_ID}`,
        contentType: 'image/png',
        sizeBytes: 42,
        createdAt: '2026-11-06T03:00:00.000Z',
        sent: false,
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        url: '/api/revision-note-images/44444444-4444-4444-8444-444444444444',
        contentType: 'image/webp',
        sizeBytes: 7,
        createdAt: '2026-11-06T03:05:00.000Z',
        sent: true,
      },
    ]);
    expect(prisma.revision_note_images.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { submission_id: SUBMISSION_ID },
      select: {
        id: true,
        content_type: true,
        size_bytes: true,
        created_at: true,
        sent_at: true,
      },
      orderBy: [{ created_at: 'asc' }],
    });
  });

  it('lists nothing for a note with no images', async () => {
    await expect(service(client(), store()).list(SUBMISSION_ID)).resolves.toEqual(
      [],
    );
  });
});

describe('RevisionNoteImagesService keys', () => {
  it('gives each upload a key of its own when the app leaves it to chance', async () => {
    const files = store();
    const prisma = client();
    const withChance = new RevisionNoteImagesService(prisma, files);

    await withChance.upload(SUBMISSION_ID, IMAGE, ADMIN_USER_ID);
    await withChance.upload(SUBMISSION_ID, IMAGE, ADMIN_USER_ID);

    const keys = files.put.mock.calls.map(([key]) => key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });
});
