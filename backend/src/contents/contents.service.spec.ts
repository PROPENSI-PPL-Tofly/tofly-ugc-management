import { ContentCreationService } from './contents.service.js';

describe('ContentCreationService', () => {
  it('saves Specific content and returns the created record', async () => {
    const contractId = '550e8400-e29b-41d4-a716-446655440000';

    const input = {
      contractId,
      type: 'specific' as const,
      deadline: '2026-10-10',
      name: 'Product launch',
      brief: 'Introduce the new product.',
    };

    const savedContent = {
      id: 'a08576d2-15a7-4ed0-bf4b-f5a28c2d65a0',
      contract_id: contractId,
      type: 'specific',
      name: input.name,
      brief: input.brief,
      deadline: new Date('2026-10-10T00:00:00.000Z'),
      status: 'scheduled',
    };

    const prisma = {
        contracts: {
    findUnique: vi.fn().mockResolvedValue({
      id: contractId,
    }),
  },
      contents: {
        create: vi.fn().mockResolvedValue(savedContent),
      },
    };

    const service = new ContentCreationService(prisma);

    await expect(service.create(input)).resolves.toEqual({
      id: savedContent.id,
      contractId,
      type: 'specific',
      name: input.name,
      brief: input.brief,
      deadline: '2026-10-10',
      status: 'scheduled',
    });

    expect(prisma.contents.create).toHaveBeenCalledWith({
      data: {
        contract_id: contractId,
        type: 'specific',
        name: input.name,
        brief: input.brief,
        deadline: new Date('2026-10-10T00:00:00.000Z'),
        status: 'scheduled',
      },
    });
  });

it('rejects content creation when the contract does not exist', async () => {
  const contractId = '550e8400-e29b-41d4-a716-446655440000';

  const input = {
    contractId,
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

  const service = new ContentCreationService(prisma);

  await expect(service.create(input)).rejects.toMatchObject({
    status: 404,
    response: {
      code: 'CONTRACT_NOT_FOUND',
      message: 'Kontrak tidak ditemukan',
    },
  });

  expect(prisma.contracts.findUnique).toHaveBeenCalledWith({
    where: { id: contractId },
  });

  expect(prisma.contents.create).not.toHaveBeenCalled();
});
});