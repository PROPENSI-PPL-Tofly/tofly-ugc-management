import { SubmissionRevisionRepository } from './submission-revision.repository.js';

const ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
const IMAGE_ID = '22222222-2222-4222-8222-222222222222';
const NOTE = {
  revisionNotes: 'Mohon perbaiki bagian pembuka.',
  revisionNotesHtml: '<p>Mohon <strong>perbaiki</strong> bagian pembuka.</p>',
  imageIds: [IMAGE_ID],
};

describe('SubmissionRevisionRepository', () => {
  it('records Revision Requested with the Admin identity, the note and exactly the images the editor sent', async () => {
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';
    const contentId = '550e8400-e29b-41d4-a716-446655440001';
    const updateManyContent = vi.fn().mockResolvedValue({ count: 1 });
    const updateSubmission = vi.fn().mockResolvedValue({
      id: submissionId,
      content_id: contentId,
      revision_notes: NOTE.revisionNotes,
      revision_notes_html: NOTE.revisionNotesHtml,
    });
    const findImages = vi.fn().mockResolvedValue([
      { id: IMAGE_ID, content_type: 'image/png' },
    ]);
    const markSent = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      submissions: { update: updateSubmission },
      contents: { updateMany: updateManyContent },
      revision_note_images: { findMany: findImages, updateMany: markSent },
      users: {
        findUnique: vi.fn().mockResolvedValue({ id: ADMIN_USER_ID }),
      },
      content_events: {
        create: vi.fn().mockResolvedValue({ id: 'event-id' }),
      },
    };
    const runTransaction = vi.fn(
      async (callback: (tx: typeof transaction) => Promise<any>) =>
        callback(transaction),
    );
    const repository = new SubmissionRevisionRepository({
      submissions: { findUnique: vi.fn() },
      $transaction: runTransaction,
    });

    await Reflect.apply(repository.saveRevision, repository, [
      submissionId,
      contentId,
      NOTE,
      ADMIN_USER_ID,
    ]);

    expect(transaction.users.findUnique).toHaveBeenCalledWith({
      where: { id: ADMIN_USER_ID },
      select: { id: true },
    });
    expect(findImages).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: { in: NOTE.imageIds },
        submission_id: submissionId,
        sent_at: null,
      },
      select: { id: true, content_type: true },
    });
    expect(markSent).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: NOTE.imageIds }, submission_id: submissionId },
      data: { sent_at: expect.any(Date) },
    });
    expect(transaction.content_events.create).toHaveBeenCalledWith({
      data: {
        content_id: contentId,
        event_type: 'Revision Requested',
        actor_name: 'Admin',
        actor_role: 'admin',
        actor_user_id: ADMIN_USER_ID,
        occurred_at: expect.any(Date),
        event_data: {
          revision_note: NOTE.revisionNotes,
          revision_note_html: NOTE.revisionNotesHtml,
          images: [{ id: IMAGE_ID, content_type: 'image/png' }],
          // PBI-33: the draft it was asked on, so a follow-up finds its note by id, not by time.
          submission_id: submissionId,
        },
      },
    });
    expect(runTransaction).toHaveBeenCalledOnce();
    expect(updateManyContent.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.content_events.create.mock.invocationCallOrder[0],
    );
    expect(updateSubmission.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.content_events.create.mock.invocationCallOrder[0],
    );
  });

  it('records the images in the order the editor named them, not the order they were uploaded', async () => {
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';
    const contentId = '550e8400-e29b-41d4-a716-446655440001';
    const first = '33333333-3333-4333-8333-333333333333';
    const second = '44444444-4444-4444-8444-444444444444';
    const createEvent = vi.fn().mockResolvedValue({ id: 'event-id' });
    const transaction = {
      submissions: {
        update: vi.fn().mockResolvedValue({
          id: submissionId,
          content_id: contentId,
          revision_notes: NOTE.revisionNotes,
          revision_notes_html: NOTE.revisionNotesHtml,
        }),
      },
      contents: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      revision_note_images: {
        findMany: vi.fn().mockResolvedValue([
          { id: second, content_type: 'image/webp' },
          { id: first, content_type: 'image/png' },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      users: { findUnique: vi.fn().mockResolvedValue({ id: ADMIN_USER_ID }) },
      content_events: { create: createEvent },
    };
    const repository = new SubmissionRevisionRepository({
      submissions: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    });

    await repository.saveRevision(
      submissionId,
      contentId,
      { ...NOTE, imageIds: [first, second] },
      ADMIN_USER_ID,
    );

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_data: expect.objectContaining({
            images: [
              { id: first, content_type: 'image/png' },
              { id: second, content_type: 'image/webp' },
            ],
          }),
        }),
      }),
    );
  });

  it('refuses an image id that is not this note to send', async () => {
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';
    const contentId = '550e8400-e29b-41d4-a716-446655440001';
    const markSent = vi.fn();
    const createEvent = vi.fn();
    const transaction = {
      submissions: {
        update: vi.fn().mockResolvedValue({
          id: submissionId,
          content_id: contentId,
          revision_notes: NOTE.revisionNotes,
          revision_notes_html: NOTE.revisionNotesHtml,
        }),
      },
      contents: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      revision_note_images: {
        // The second name is another note's image, so only one of the two comes back.
        findMany: vi.fn().mockResolvedValue([{ id: IMAGE_ID, content_type: 'image/png' }]),
        updateMany: markSent,
      },
      users: { findUnique: vi.fn().mockResolvedValue({ id: ADMIN_USER_ID }) },
      content_events: { create: createEvent },
    };
    const repository = new SubmissionRevisionRepository({
      submissions: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    });

    await expect(
      repository.saveRevision(
        submissionId,
        contentId,
        {
          ...NOTE,
          imageIds: [IMAGE_ID, '55555555-5555-4555-8555-555555555555'],
        },
        ADMIN_USER_ID,
      ),
    ).rejects.toMatchObject({
      status: 422,
      response: {
        message: 'Data revisi tidak valid',
        errors: { imageIds: 'Gambar tidak ditemukan pada catatan ini' },
      },
    });
    expect(markSent).not.toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('records no images in the event for a note sent without screenshots', async () => {
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';
    const contentId = '550e8400-e29b-41d4-a716-446655440001';
    const createEvent = vi.fn().mockResolvedValue({ id: 'event-id' });
    const findImages = vi.fn();
    const transaction = {
      submissions: {
        update: vi.fn().mockResolvedValue({
          id: submissionId,
          content_id: contentId,
          revision_notes: NOTE.revisionNotes,
          revision_notes_html: NOTE.revisionNotesHtml,
        }),
      },
      contents: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      revision_note_images: {
        findMany: findImages,
        updateMany: vi.fn(),
      },
      users: { findUnique: vi.fn().mockResolvedValue({ id: ADMIN_USER_ID }) },
      content_events: { create: createEvent },
    };
    const repository = new SubmissionRevisionRepository({
      submissions: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    });

    await repository.saveRevision(
      submissionId,
      contentId,
      {
        revisionNotes: NOTE.revisionNotes,
        revisionNotesHtml: NOTE.revisionNotesHtml,
      },
      ADMIN_USER_ID,
    );

    expect(findImages).not.toHaveBeenCalled();
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_data: expect.objectContaining({ images: [] }),
        }),
      }),
    );
  });

  it('stores the revision note and changes the content status to draft_revision', async () => {
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';
    const contentId = '550e8400-e29b-41d4-a716-446655440001';

  const updateSubmission = vi.fn().mockResolvedValue({
    id: submissionId,
    content_id: contentId,
    revision_notes: NOTE.revisionNotes,
    revision_notes_html: NOTE.revisionNotesHtml,
  });

  const updateManyContent = vi.fn().mockResolvedValue({
    count: 1,
  });

  const repository = new SubmissionRevisionRepository({
    submissions: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (callback) =>
      callback({
        submissions: {
          update: updateSubmission,
        },
        contents: {
          updateMany: updateManyContent,
        },
      }),
    ),
  });

  const result = await repository.saveRevision(
    submissionId,
    contentId,
    NOTE,
  );

  expect(updateManyContent).toHaveBeenCalledExactlyOnceWith({
    where: {
      id: contentId,
      status: {
        in: ['draft_review'],
      },
    },
    data: {
      status: 'draft_revision',
    },
  });

  expect(updateSubmission).toHaveBeenCalledExactlyOnceWith({
    where: {
      id: submissionId,
    },
    data: {
      revision_notes: NOTE.revisionNotes,
      revision_notes_html: NOTE.revisionNotesHtml,
    },
  });

  expect(result).toEqual({
    id: submissionId,
    contentId,
    status: 'draft_revision',
    revisionNotes: NOTE.revisionNotes,
    revisionNotesHtml: NOTE.revisionNotesHtml,
  });

  it('answers with the content id of the row it saved, not the one it was handed', async () => {
    const requestedContentId = '550e8400-e29b-41d4-a716-446655440001';
    const savedContentId = '550e8400-e29b-41d4-a716-446655440099';

    const repository = new SubmissionRevisionRepository({
      submissions: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(async (callback) =>
        callback({
          submissions: {
            update: vi.fn().mockResolvedValue({
              id: '550e8400-e29b-41d4-a716-446655440000',
              content_id: savedContentId,
              revision_notes: NOTE.revisionNotes,
              revision_notes_html: NOTE.revisionNotesHtml,
            }),
          },
          contents: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        }),
      ),
    });

    const result = await repository.saveRevision(
      '550e8400-e29b-41d4-a716-446655440000',
      requestedContentId,
      NOTE,
    );

    expect(result).toHaveProperty('contentId', savedContentId);
  });

  it('does not save the revision note when the content is no longer reviewable', async () => {
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';
    const contentId = '550e8400-e29b-41d4-a716-446655440001';

  const updateSubmission = vi.fn().mockResolvedValue({
    id: submissionId,
    content_id: contentId,
    revision_notes: 'Mohon perbaiki draft ini.',
    revision_notes_html: 'Mohon perbaiki draft ini.',
  });

  const updateContent = vi.fn().mockResolvedValue({
    id: contentId,
    status: 'draft_revision',
  });

  const updateManyContent = vi.fn().mockResolvedValue({
    count: 0,
  });

  const repository = new SubmissionRevisionRepository({
    submissions: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (callback) =>
      callback({
        submissions: {
          update: updateSubmission,
        },
        contents: {
          update: updateContent,
          updateMany: updateManyContent,
        },
      }),
    ),
  });

  const result = await repository.saveRevision(
    submissionId,
    contentId,
    { revisionNotes: 'Mohon perbaiki draft ini.', revisionNotesHtml: 'Mohon perbaiki draft ini.' },
  );

  expect(updateManyContent).toHaveBeenCalledExactlyOnceWith({
    where: {
      id: contentId,
      status: {
        in: ['draft_review'],
      },
    },
    data: {
      status: 'draft_revision',
    },
  });

  expect(updateSubmission).not.toHaveBeenCalled();

  expect(result).toBeNull();
});
  it('finds a submission with its content ID, current status, and latest state', async () => {
  const submissionId = '550e8400-e29b-41d4-a716-446655440000';
  const contentId = '550e8400-e29b-41d4-a716-446655440001';

  const findUnique = vi.fn().mockResolvedValue({
    id: submissionId,
    content_id: contentId,
    contents: {
      status: 'draft_review',
      submissions: [
        {
          id: submissionId,
        },
      ],
    },
  });

  const repository = new SubmissionRevisionRepository({
    submissions: {
      findUnique,
    },
    $transaction: vi.fn(),
  });

  const result = await repository.findById(submissionId);

  expect(findUnique).toHaveBeenCalledExactlyOnceWith({
    where: {
      id: submissionId,
      content_id: contentId,
      revision_notes: 'Mohon perbaiki draft ini.',
    });

    const updateContent = vi.fn().mockResolvedValue({
      id: contentId,
      status: 'draft_revision',
    });

    const updateManyContent = vi.fn().mockResolvedValue({
      count: 0,
    });

    const repository = new SubmissionRevisionRepository({
      submissions: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(async (callback) =>
        callback({
          submissions: {
            update: updateSubmission,
          },
          contents: {
            update: updateContent,
            updateMany: updateManyContent,
          },
        }),
      ),
    });

    const result = await repository.saveRevision(
      submissionId,
      contentId,
      'Mohon perbaiki draft ini.',
    );

    expect(updateManyContent).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: contentId,
        status: {
          in: ['draft_review'],
        },
      },
      data: {
        status: 'draft_revision',
      },
    });

    expect(updateSubmission).not.toHaveBeenCalled();

    expect(result).toBeNull();
  });
  it('finds a submission with its content ID, current status, and latest state', async () => {
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';
    const contentId = '550e8400-e29b-41d4-a716-446655440001';

    const findUnique = vi.fn().mockResolvedValue({
      id: submissionId,
      content_id: contentId,
      contents: {
        status: 'draft_review',
        submissions: [
          {
            id: submissionId,
          },
        ],
      },
    });

    const repository = new SubmissionRevisionRepository({
      submissions: {
        findUnique,
      },
      $transaction: vi.fn(),
    });

    const result = await repository.findById(submissionId);

    expect(findUnique).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: submissionId,
      },
      select: {
        id: true,
        content_id: true,
        contents: {
          select: {
            status: true,
            submissions: {
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
              take: 1,
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    expect(result).toEqual({
      id: submissionId,
      content_id: contentId,
      status: 'draft_review',
      isLatest: true,
    });
  });
  it('marks an older submission as not latest', async () => {
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';
    const contentId = '550e8400-e29b-41d4-a716-446655440001';

    const findUnique = vi.fn().mockResolvedValue({
      id: submissionId,
      content_id: contentId,
      contents: {
        status: 'draft_review',
        submissions: [
          {
            id: '550e8400-e29b-41d4-a716-446655440099',
          },
        ],
      },
    });

    const repository = new SubmissionRevisionRepository({
      submissions: {
        findUnique,
      },
      $transaction: vi.fn(),
    });

    const result = await repository.findById(submissionId);

    expect(result).toEqual({
      id: submissionId,
      content_id: contentId,
      status: 'draft_review',
      isLatest: false,
    });
  });
  it('returns null when the submission does not exist', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);

    const repository = new SubmissionRevisionRepository({
      submissions: { findUnique },
      $transaction: vi.fn(),
    });

    const result = await repository.findById(
      '550e8400-e29b-41d4-a716-446655440000',
    );

    expect(findUnique).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: '550e8400-e29b-41d4-a716-446655440000',
      },
      select: {
        id: true,
        content_id: true,
        contents: {
          select: {
            status: true,
            submissions: {
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
              take: 1,
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    expect(result).toBeNull();
  });

  it('treats a content whose submissions vanished mid-request as not latest', async () => {
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';

    const repository = new SubmissionRevisionRepository({
      submissions: {
        findUnique: vi.fn().mockResolvedValue({
          id: submissionId,
          content_id: '550e8400-e29b-41d4-a716-446655440001',
          contents: { status: 'draft_review', submissions: [] },
        }),
      },
      $transaction: vi.fn(),
    });

    await expect(repository.findById(submissionId)).resolves.toMatchObject({
      isLatest: false,
    });
  });
});
