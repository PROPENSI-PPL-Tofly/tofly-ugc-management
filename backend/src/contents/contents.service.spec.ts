import { ContentCreationService } from './contents.service.js';

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
          start_date: new Date('2026-09-01T00:00:00.000Z'),
          end_date: new Date('2026-12-31T00:00:00.000Z'),
        }),
      },
      contents: {
        create: vi.fn().mockResolvedValue(savedContent),
      },
    };

    const service = new ContentCreationService(prisma, TEST_SCHEDULING);

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

    const service = new ContentCreationService(prisma, TEST_SCHEDULING);

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

    const service = new ContentCreationService(prisma, TEST_SCHEDULING);

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

    const service = new ContentCreationService(prisma, {
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
          start_date: new Date('2026-10-10T00:00:00.000Z'),
          end_date: new Date('2026-10-31T00:00:00.000Z'),
        }),
      },
      contents: {
        create: vi.fn().mockResolvedValue(savedContent),
      },
    };

    const service = new ContentCreationService(prisma, {
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
          start_date: new Date('2099-12-01T00:00:00.000Z'),
          end_date: new Date('2099-12-31T00:00:00.000Z'),
        }),
      },
      contents: {
        create: vi.fn().mockResolvedValue(savedContent),
      },
    };

    // Do not supply scheduling dependencies here:
    // this exercises the service's default today() and bufferDays().
    const service = new ContentCreationService(prisma);

    await expect(service.create(input)).resolves.toMatchObject({
      contractId,
      deadline: '2099-12-31',
      status: 'scheduled',
    });

    expect(prisma.contents.create).toHaveBeenCalledOnce();
  });
});
