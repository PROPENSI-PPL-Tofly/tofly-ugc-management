import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ContentsService } from './contents.service.js';

describe('ContentsService.create', () => {
  it('rejects when the contract content quota is already full', async () => {
    const prisma = {
      contracts: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'contract-1',
            creator_id: '11111111-1111-4111-8111-111111111111',
            start_date: new Date('2026-09-01T00:00:00.000Z'),
            end_date: new Date('2026-10-01T00:00:00.000Z'),
            days_between: 7,
            content_quota: 3,
            fixed_rate: 100000,
            creators: {
              first_name: 'Evelyn',
              middle_name: null,
              last_name: 'Aritonang',
            },
            contents: [
              {
                id: 'content-1',
                name: 'Content 1',
                type: 'specific',
                is_proposal: false,
              },
              {
                id: 'content-2',
                name: 'Content 2',
                type: 'specific',
                is_proposal: false,
              },
              {
                id: 'content-3',
                name: 'Content 3',
                type: 'evergreen',
                is_proposal: false,
              },
            ],
          },
        ]),
      },
      contents: {
        create: vi.fn().mockResolvedValue({
          id: 'new-content',
          name: 'Fourth Content',
          type: 'specific',
          brief: 'Fourth content brief',
          deadline: new Date('2026-09-20T00:00:00.000Z'),
          status: 'scheduled',
        }),
      },
    } as unknown as PrismaService;

    const service = new ContentsService(prisma);

    const input = {
      creatorId: '11111111-1111-4111-8111-111111111111',
      type: 'specific',
      name: 'Fourth Content',
      brief: 'Fourth content brief',
      deadline: '2026-09-20',
    };

    const now = new Date('2026-09-10T10:00:00.000Z');

    await expect(service.create(input, now)).rejects.toMatchObject({
      response: {
        errors: {
          quota: expect.any(String),
        },
      },
    });

    expect(prisma.contents.create).not.toHaveBeenCalled();
  });

  it('triggers the temporary creator email notification marker after save', async () => {
    const prisma = {
      contracts: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'contract-1',
            creator_id: '11111111-1111-4111-8111-111111111111',
            start_date: new Date('2026-09-01T00:00:00.000Z'),
            end_date: new Date('2026-10-01T00:00:00.000Z'),
            days_between: 7,
            content_quota: 3,
            fixed_rate: 100000,
            creators: {
              first_name: 'Evelyn',
              middle_name: null,
              last_name: 'Aritonang',
            },
            contents: [
              {
                id: 'content-1',
                name: 'Content 1',
                type: 'specific',
                is_proposal: false,
              },
            ],
          },
        ]),
      },
      contents: {
        create: vi.fn().mockResolvedValue({
          id: 'new-content',
          name: 'New Specific Content',
          type: 'specific',
          brief: 'Specific content brief',
          deadline: new Date('2026-09-20T00:00:00.000Z'),
          status: 'scheduled',
        }),
      },
    } as unknown as PrismaService;

    const consoleInfo = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined);

    try {
      const service = new ContentsService(prisma);

      await service.create(
        {
          creatorId: '11111111-1111-4111-8111-111111111111',
          type: 'specific',
          name: 'New Specific Content',
          brief: 'Specific content brief',
          deadline: '2026-09-20',
        },
        new Date('2026-09-10T10:00:00.000Z'),
      );

      expect(consoleInfo).toHaveBeenCalledWith(
        '[MOCK EMAIL] Creator content notification',
        expect.objectContaining({
          creatorId: '11111111-1111-4111-8111-111111111111',
          contentName: 'New Specific Content',
          deadline: '2026-09-20',
        }),
      );
    } finally {
      consoleInfo.mockRestore();
    }
  });
});
