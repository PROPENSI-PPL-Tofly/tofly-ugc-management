import {
  CreatorCommentService,
  type CreatorCommentClient,
  type CreatorCommentTransaction,
} from './creator-comment.service.js';

const CONTENT_ID = 'a08576d2-15a7-4ed0-bf4b-f5a28c2d65a0';
const CREATOR_ID = 'b08576d2-15a7-4ed0-bf4b-f5a28c2d65a0';

const VALID_COMMENT = {
  comment: 'The updated draft is ready for review.',
};

function createHarness(options?: {
  content?: { id: string } | null;
  creator?: {
    first_name: string;
    middle_name: string | null;
    last_name: string | null;
  } | null;
}) {
  const contentsFindFirst = vi.fn(
    async (
      _args: Parameters<CreatorCommentTransaction['contents']['findFirst']>[0],
    ) =>
      options?.content === undefined ? { id: CONTENT_ID } : options.content,
  );

  const creatorsFindUnique = vi.fn(
    async (
      _args: Parameters<CreatorCommentTransaction['creators']['findUnique']>[0],
    ) =>
      options?.creator === undefined
        ? {
            first_name: 'Dina',
            middle_name: 'Putri',
            last_name: 'Aritonang',
          }
        : options.creator,
  );

  const eventCreate = vi.fn(
    async (
      _args: Parameters<
        CreatorCommentTransaction['content_events']['create']
      >[0],
    ) => undefined,
  );

  const transaction: CreatorCommentTransaction = {
    contents: {
      findFirst: contentsFindFirst,
    },
    creators: {
      findUnique: creatorsFindUnique,
    },
    content_events: {
      create: eventCreate,
    },
  };

  const transactionRunner = vi.fn(
    async <T>(
      work: (transaction: CreatorCommentTransaction) => Promise<T>,
    ): Promise<T> => work(transaction),
  );

  const client: CreatorCommentClient = {
    $transaction: transactionRunner,
  };

  return {
    service: new CreatorCommentService(client),
    contentsFindFirst,
    creatorsFindUnique,
    eventCreate,
    transactionRunner,
  };
}

describe('CreatorCommentService.addComment', () => {
  it('records a creator comment with the creator full name', async () => {
    const {
      service,
      contentsFindFirst,
      creatorsFindUnique,
      eventCreate,
      transactionRunner,
    } = createHarness();

    await expect(
      service.addComment(CONTENT_ID, CREATOR_ID, VALID_COMMENT),
    ).resolves.toBeUndefined();

    expect(transactionRunner).toHaveBeenCalledTimes(1);

    expect(contentsFindFirst).toHaveBeenCalledWith({
      where: {
        id: CONTENT_ID,
        is_proposal: false,
        contracts: {
          creator_id: CREATOR_ID,
        },
      },
      select: {
        id: true,
      },
    });

    expect(creatorsFindUnique).toHaveBeenCalledWith({
      where: {
        id: CREATOR_ID,
      },
      select: {
        first_name: true,
        middle_name: true,
        last_name: true,
      },
    });

    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        content_id: CONTENT_ID,
        event_type: 'Creator Comment',
        actor_name: 'Dina Putri Aritonang',
        actor_role: 'creator',
        occurred_at: expect.any(Date),
        event_data: {
          comment: VALID_COMMENT.comment,
        },
      },
    });
  });

  it('records the creator name when the middle and last names are absent', async () => {
    const { service, eventCreate } = createHarness({
      creator: {
        first_name: 'Dina',
        middle_name: null,
        last_name: null,
      },
    });

    await service.addComment(CONTENT_ID, CREATOR_ID, VALID_COMMENT);

    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        content_id: CONTENT_ID,
        event_type: 'Creator Comment',
        actor_name: 'Dina',
        actor_role: 'creator',
        occurred_at: expect.any(Date),
        event_data: {
          comment: VALID_COMMENT.comment,
        },
      },
    });
  });

  it('rejects when the content does not belong to the creator', async () => {
    const { service, creatorsFindUnique, eventCreate } = createHarness({
      content: null,
    });

    await expect(
      service.addComment(CONTENT_ID, CREATOR_ID, VALID_COMMENT),
    ).rejects.toMatchObject({
      response: {
        code: 'CONTENT_NOT_FOUND',
        message: 'Konten tidak ditemukan',
      },
      status: 404,
    });

    expect(creatorsFindUnique).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it('rejects when the creator profile cannot be found', async () => {
    const { service, eventCreate } = createHarness({
      creator: null,
    });

    await expect(
      service.addComment(CONTENT_ID, CREATOR_ID, VALID_COMMENT),
    ).rejects.toMatchObject({
      response: {
        code: 'CREATOR_NOT_FOUND',
        message: 'Kreator tidak ditemukan',
      },
      status: 404,
    });

    expect(eventCreate).not.toHaveBeenCalled();
  });

  it('propagates a comment event persistence failure', async () => {
    const { service, eventCreate } = createHarness();
    const persistenceError = new Error('Database write failed');

    eventCreate.mockRejectedValueOnce(persistenceError);

    await expect(
      service.addComment(CONTENT_ID, CREATOR_ID, VALID_COMMENT),
    ).rejects.toBe(persistenceError);
  });
});
