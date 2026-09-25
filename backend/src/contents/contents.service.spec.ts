import {
  ContentCreationService,
  type ContentsTransaction,
} from './contents.service.js';

function transactional(client: Omit<ContentsTransaction, '$queryRaw'>) {
  return {
    $transaction: async <T>(work: (tx: ContentsTransaction) => Promise<T>) =>
      work({ ...client, $queryRaw: vi.fn().mockResolvedValue([]) }),
  };
}

describe('ContentCreationService', () => {
  const CONTRACT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const CONTENT_ID = 'a08576d2-15a7-4ed0-bf4b-f5a28c2d65a0';

  const TEST_SCHEDULING = {
    today: () => new Date('2026-09-24T00:00:00.000Z'),
    bufferDays: async () => 5,
  };

  it('saves Specific content and returns the created record', async () => {
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

    const prisma = {
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
    };

    const service = new ContentCreationService(
      transactional(prisma),
      TEST_SCHEDULING,
    );

    await expect(service.create(input)).resolves.toEqual({
      id: CONTENT_ID,
      contractId: CONTRACT_ID,
      type: 'specific',
      name: input.name,
      brief: input.brief,
      deadline: '2026-10-10',
      status: 'scheduled',
    });

    expect(prisma.contracts.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONTRACT_ID },
      }),
    );

    expect(prisma.contents.create).toHaveBeenCalledWith({
      data: {
        contract_id: CONTRACT_ID,
        type: 'specific',
        name: input.name,
        brief: input.brief,
        deadline: new Date('2026-10-10T00:00:00.000Z'),
        status: 'scheduled',
      },
    });
  });

  it('rejects content creation when the contract does not exist', async () => {
    const input = {
      contractId: CONTRACT_ID,
      type: 'specific' as const,
      deadline: '2026-10-10',
      name: 'Product launch',
      brief: 'Introduce the new product.',
    };

    const prisma = {
      contracts: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      contents: {
        create: vi.fn(),
      },
    };

    const service = new ContentCreationService(
      transactional(prisma),
      TEST_SCHEDULING,
    );

    await expect(service.create(input)).rejects.toMatchObject({
      status: 404,
      response: {
        code: 'CONTRACT_NOT_FOUND',
        message: 'Kontrak tidak ditemukan',
      },
    });

    expect(prisma.contracts.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONTRACT_ID },
      }),
    );

    expect(prisma.contents.create).not.toHaveBeenCalled();
  });

  it('creates Evergreen content with an automatically generated name', async () => {
    const input = {
      contractId: CONTRACT_ID,
      type: 'evergreen' as const,
      deadline: '2026-10-10',
    };

    const generatedName = 'Evg_2_Rangga Pratama_10102026';

    const prisma = {
      contracts: {
        findUnique: vi.fn().mockResolvedValue({
          id: CONTRACT_ID,
          content_quota: 2,
          start_date: new Date('2026-09-01T00:00:00.000Z'),
          end_date: new Date('2026-12-31T00:00:00.000Z'),
          creators: {
            first_name: 'Rangga',
            middle_name: null,
            last_name: 'Pratama',
          },
          contents: [
            {
              id: '53dc8de7-f65a-4f6a-9927-98e2d406331d',
              type: 'evergreen',
              name: 'Evg_1_Rangga Pratama_26092026',
            },
          ],
        }),
      },
      contents: {
        create: vi.fn().mockResolvedValue({
          id: CONTENT_ID,
          contract_id: CONTRACT_ID,
          type: 'evergreen',
          name: generatedName,
          brief: '',
          deadline: new Date('2026-10-10T00:00:00.000Z'),
          status: 'scheduled',
        }),
      },
    };

    const service = new ContentCreationService(
      transactional(prisma),
      TEST_SCHEDULING,
    );

    await expect(service.create(input)).resolves.toEqual({
      id: CONTENT_ID,
      contractId: CONTRACT_ID,
      type: 'evergreen',
      name: generatedName,
      brief: '',
      deadline: '2026-10-10',
      status: 'scheduled',
    });

    expect(prisma.contents.create).toHaveBeenCalledWith({
      data: {
        contract_id: CONTRACT_ID,
        type: 'evergreen',
        name: generatedName,
        brief: '',
        deadline: new Date('2026-10-10T00:00:00.000Z'),
        status: 'scheduled',
      },
    });
  });

  it('rejects a deadline when the contract starts in the future', async () => {
    const input = {
      contractId: CONTRACT_ID,
      type: 'specific' as const,
      deadline: '2026-10-14',
      name: 'Product launch',
      brief: 'Introduce the new product.',
    };

    const prisma = {
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
          start_date: new Date('2026-10-10T00:00:00.000Z'),
          end_date: new Date('2026-12-31T00:00:00.000Z'),
        }),
      },
      contents: {
        create: vi.fn(),
      },
    };

    const service = new ContentCreationService(transactional(prisma), {
      today: () => new Date('2026-09-24T00:00:00.000Z'),
      bufferDays: async () => 5,
    });

    await expect(service.create(input)).rejects.toMatchObject({
      status: 422,
      response: {
        errors: {
          deadline: expect.any(String),
        },
      },
    });

    expect(prisma.contents.create).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'before the minimum deadline after the global buffer',
      deadline: '2026-10-14',
    },
    {
      label: 'after the contract ends',
      deadline: '2026-11-01',
    },
  ])('rejects a deadline $label', async ({ deadline }) => {
    const input = {
      contractId: CONTRACT_ID,
      type: 'specific' as const,
      deadline,
      name: 'Product launch',
      brief: 'Introduce the new product.',
    };

    const prisma = {
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
          start_date: new Date('2026-10-10T00:00:00.000Z'),
          end_date: new Date('2026-10-31T00:00:00.000Z'),
        }),
      },
      contents: {
        create: vi.fn().mockResolvedValue({
          id: CONTENT_ID,
          contract_id: CONTRACT_ID,
          type: 'specific',
          name: input.name,
          brief: input.brief,
          deadline: new Date(`${deadline}T00:00:00.000Z`),
          status: 'scheduled',
        }),
      },
    };

    const service = new ContentCreationService(transactional(prisma), {
      today: () => new Date('2026-10-10T00:00:00.000Z'),
      bufferDays: async () => 5,
    });

    await expect(service.create(input)).rejects.toMatchObject({
      status: 422,
      response: {
        errors: expect.objectContaining({
          deadline: expect.any(String),
        }),
      },
    });

    expect(prisma.contents.create).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'the earliest allowed deadline',
      deadline: '2026-10-15',
    },
    {
      label: 'the contract end date',
      deadline: '2026-10-31',
    },
  ])('accepts $label', async ({ deadline }) => {
    const contractId = '550e8400-e29b-41d4-a716-446655440000';

    const input = {
      contractId,
      type: 'specific' as const,
      deadline,
      name: 'Product launch',
      brief: 'Introduce the new product.',
    };

    const savedContent = {
      id: 'a08576d2-15a7-4ed0-bf4b-f5a28c2d65a0',
      contract_id: contractId,
      type: 'specific',
      name: input.name,
      brief: input.brief,
      deadline: new Date(`${deadline}T00:00:00.000Z`),
      status: 'scheduled',
    };

    const prisma = {
      contracts: {
        findUnique: vi.fn().mockResolvedValue({
          id: contractId,
          contents: [],
          creators: {
            first_name: 'Rangga',
            middle_name: null,
            last_name: 'Pratama',
          },
          content_quota: 2,
          start_date: new Date('2026-10-10T00:00:00.000Z'),
          end_date: new Date('2026-10-31T00:00:00.000Z'),
        }),
      },
      contents: {
        create: vi.fn().mockResolvedValue(savedContent),
      },
    };

    const service = new ContentCreationService(transactional(prisma), {
      today: () => new Date('2026-10-10T00:00:00.000Z'),
      bufferDays: async () => 5,
    });

    await expect(service.create(input)).resolves.toMatchObject({
      contractId,
      deadline,
      status: 'scheduled',
    });

    expect(prisma.contents.create).toHaveBeenCalledOnce();
  });

  it('uses the default scheduling functions when none are provided', async () => {
    const contractId = '550e8400-e29b-41d4-a716-446655440000';

    const input = {
      contractId,
      type: 'specific' as const,
      deadline: '2099-12-31',
      name: 'Future campaign',
      brief: 'Test the default scheduling functions.',
    };

    const savedContent = {
      id: 'a08576d2-15a7-4ed0-bf4b-f5a28c2d65a0',
      contract_id: contractId,
      type: 'specific',
      name: input.name,
      brief: input.brief,
      deadline: new Date('2099-12-31T00:00:00.000Z'),
      status: 'scheduled',
    };

    const prisma = {
      contracts: {
        findUnique: vi.fn().mockResolvedValue({
          id: contractId,
          contents: [],
          creators: {
            first_name: 'Rangga',
            middle_name: null,
            last_name: 'Pratama',
          },
          content_quota: 2,
          start_date: new Date('2099-12-01T00:00:00.000Z'),
          end_date: new Date('2099-12-31T00:00:00.000Z'),
        }),
      },
      contents: {
        create: vi.fn().mockResolvedValue(savedContent),
      },
    };

    const service = new ContentCreationService(transactional(prisma));

    await expect(service.create(input)).resolves.toMatchObject({
      contractId,
      deadline: '2099-12-31',
      status: 'scheduled',
    });

    expect(prisma.contents.create).toHaveBeenCalledOnce();
  });

  it('triggers the temporary creator email notification marker after save', async () => {
    const consoleInfo = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined);

    try {
      const input = {
        contractId: CONTRACT_ID,
        type: 'specific' as const,
        deadline: '2026-10-10',
        name: 'New Specific Content',
        brief: 'Specific content brief',
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

      const prisma = {
        contracts: {
          findUnique: vi.fn().mockResolvedValue({
            id: CONTRACT_ID,
            creator_id: '11111111-1111-4111-8111-111111111111',
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
      };

      const service = new ContentCreationService(
        transactional(prisma),
        TEST_SCHEDULING,
      );

      await service.create(input);

      expect(consoleInfo).toHaveBeenCalledWith(
        '[MOCK EMAIL] Creator content notification',
        {
          creatorId: '11111111-1111-4111-8111-111111111111',
          contentName: 'New Specific Content',
          deadline: '2026-10-10',
        },
      );
    } finally {
      consoleInfo.mockRestore();
    }
  });
});

describe('atomic Evergreen allocation', () => {
  function setup(quota: number, types: string[]) {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      contracts: {
        findUnique: vi.fn().mockResolvedValue({
          start_date: new Date('2026-09-01Z'),
          end_date: new Date('2026-12-31Z'),
          content_quota: quota,
          creators: {
            first_name: 'Rangga',
            middle_name: 'Adi',
            last_name: 'Pratama',
          },
          contents: types.map((type) => ({ type })),
        }),
      },
      contents: {
        create: vi.fn().mockImplementation(async ({ data }) => ({
          id: 'content-id',
          ...data,
        })),
      },
    };

    const client = {
      $transaction: async <T>(
        work: (tx: ContentsTransaction) => Promise<T>,
      ) => work(transaction),
    };

    vi.spyOn(client, '$transaction');

    const service = new ContentCreationService(client, {
      today: () => new Date('2026-09-24Z'),
      bufferDays: async () => 5,
    });

    const input = {
      contractId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'evergreen' as const,
      deadline: '2026-10-10',
    };

    return { transaction, client, service, input };
  }

  it.each([0, 1])(
    'rejects a full quota of %i without inserting',
    async (quota) => {
      const { service, input, transaction } = setup(
        quota,
        Array(quota).fill('evergreen'),
      );

      await expect(service.create(input)).rejects.toMatchObject({
        status: 422,
        response: { errors: { type: expect.any(String) } },
      });

      expect(transaction.contents.create).not.toHaveBeenCalled();
    },
  );

  it('locks the contract before reading and inserting, using a bound UUID', async () => {
    const { service, input, transaction, client } = setup(2, [
      'evergreen',
      'specific',
    ]);

    await expect(service.create(input)).resolves.toMatchObject({
      name: 'Evg_2_Rangga Adi Pratama_10102026',
    });

    const query = transaction.$queryRaw.mock.calls[0][0];

    expect(query.values).toEqual([input.contractId]);

    const normalizedSql = query.sql.replace(/\s+/g, ' ').trim();

    expect(normalizedSql).toContain('WHERE id = ?::uuid FOR UPDATE');

    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.contracts.findUnique.mock.invocationCallOrder[0],
    );

    expect(
      transaction.contracts.findUnique.mock.invocationCallOrder[0],
    ).toBeLessThan(transaction.contents.create.mock.invocationCallOrder[0]);

    expect(client.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        isolationLevel: 'ReadCommitted',
      },
    );
  });

  it('returns both quota and deadline errors from SCRUM-103 before inserting', async () => {
    const { service, input, transaction } = setup(1, ['evergreen']);

    await expect(
      service.create({
        ...input,
        deadline: '2026-09-28',
      }),
    ).rejects.toMatchObject({
      status: 422,
      response: {
        errors: {
          type: 'Slot Evergreen sudah penuh',
          deadline: 'Deadline paling cepat 2026-09-29',
        },
      },
    });

    expect(transaction.contents.create).not.toHaveBeenCalled();
  });

  it('uses the supplied global buffer value for Specific content', async () => {
    const { transaction, input } = setup(1, []);

    const service = new ContentCreationService(transactional(transaction), {
      today: () => new Date('2026-09-24Z'),
      bufferDays: async () => 20,
    });

    await expect(
      service.create({
        ...input,
        type: 'specific',
        name: 'Campaign',
        brief: 'Brief',
      }),
    ).rejects.toMatchObject({
      response: {
        errors: {
          deadline: 'Deadline paling cepat 2026-10-14',
        },
      },
    });

    expect(transaction.contents.create).not.toHaveBeenCalled();
  });

  it('allows Specific content even when Evergreen quota is full', async () => {
    const { service, input } = setup(1, ['evergreen']);

    await expect(
      service.create({
        ...input,
        type: 'specific',
        name: 'Campaign',
        brief: 'Brief',
      }),
    ).resolves.toMatchObject({
      name: 'Campaign',
    });
  });

  it('does not read or insert if acquiring the lock fails', async () => {
    const { service, input, transaction } = setup(1, []);

    const error = new Error('Lock timeout');

    transaction.$queryRaw.mockRejectedValue(error);

    await expect(service.create(input)).rejects.toBe(error);

    expect(transaction.contracts.findUnique).not.toHaveBeenCalled();
    expect(transaction.contents.create).not.toHaveBeenCalled();
  });

  it('propagates insert failure to the transaction without reporting success', async () => {
    const { service, input, transaction } = setup(1, []);

    const error = new Error('Insert failed');

    transaction.contents.create.mockRejectedValue(error);

    await expect(service.create(input)).rejects.toBe(error);
  });
});