import {
  ContentCreationService,
  type ContentsClient,
  type ContentsTransaction,
} from './contents.service.js';

const ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTRACT_ID = '550e8400-e29b-41d4-a716-446655440000';
const CONTENT_ID = 'a08576d2-15a7-4ed0-bf4b-f5a28c2d65a0';

describe('ContentCreationService when the Admin user is missing', () => {
  it('rejects creation when the Admin cannot be found after saving content', async () => {
    const input = {
      contractId: CONTRACT_ID,
      type: 'specific' as const,
      deadline: '2026-10-10',
      name: 'Product launch',
      brief: 'Introduce the new product.',
    };

    const savedContent = {
      id: CONTENT_ID,
      contract_id: CONTRACT_ID,
      type: 'specific',
      name: input.name,
      brief: input.brief,
      deadline: new Date('2026-10-10T00:00:00.000Z'),
      status: 'scheduled',
    };

    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      users: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      contracts: {
        findUnique: vi.fn().mockResolvedValue({
          id: CONTRACT_ID,
          contents: [],
          creators: {
            first_name: 'Rangga',
            middle_name: null,
            last_name: 'Pratama',
          },
          content_quota: 2,
          start_date: new Date('2026-09-01T00:00:00.000Z'),
          end_date: new Date('2026-12-31T00:00:00.000Z'),
        }),
      },
      contents: {
        create: vi.fn().mockResolvedValue(savedContent),
      },
      content_events: {
        create: vi.fn().mockResolvedValue({ id: 'event-id' }),
      },
    };

    const prisma = {
      $transaction: vi.fn(async (work) => work(transaction)),
    } satisfies ContentsClient;

    const service = new ContentCreationService(prisma, {
      today: () => new Date('2026-09-24T00:00:00.000Z'),
      bufferDays: async () => 5,
    });

    await expect(service.create(input, ADMIN_USER_ID)).rejects.toMatchObject({
      status: 404,
      response: {
        code: 'ADMIN_NOT_FOUND',
        message: 'Admin tidak ditemukan',
      },
    });

    expect(transaction.contents.create).toHaveBeenCalledOnce();

    expect(transaction.users.findUnique).toHaveBeenCalledWith({
      where: { id: ADMIN_USER_ID },
      select: { id: true },
    });

    expect(transaction.content_events.create).not.toHaveBeenCalled();
  });
});
