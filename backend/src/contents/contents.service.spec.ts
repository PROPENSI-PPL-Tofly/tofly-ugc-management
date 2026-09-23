import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { ContentsService } from './contents.service.js';

const TODAY = new Date('2026-09-23T00:00:00Z');

function day(offset: number): Date {
  return new Date(Date.UTC(2026, 8, 23 + offset));
}

describe('ContentsService', () => {
  let service: ContentsService;
  const prisma = {
    content: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    contracts: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ContentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ContentsService);
  });

  describe('assignManualSlot', () => {
    it('updates content deadline to the assigned date', async () => {
      prisma.content.findUnique.mockResolvedValue({
        id: 'content-1',
        contract_id: 'contract-1',
        deadline: day(10),
      });
      prisma.contracts.findUnique.mockResolvedValue({
        id: 'contract-1',
        start_date: day(-30),
        end_date: day(90),
        days_between: 14,
      });
      prisma.content.update.mockResolvedValue({
        id: 'content-1',
        deadline: day(20),
      });

      const result = await service.assignManualSlot({
        contentId: 'content-1',
        deadline: '2026-10-13',
      });

      expect(result).toHaveProperty('id', 'content-1');
      expect(prisma.content.update).toHaveBeenCalledWith({
        where: { id: 'content-1' },
        data: { deadline: day(20) },
        select: expect.any(Object),
      });
    });

    it('throws CONTENT_NOT_FOUND for nonexistent content', async () => {
      prisma.content.findUnique.mockResolvedValue(null);

      await expect(
        service.assignManualSlot({
          contentId: 'nonexistent',
          deadline: '2026-10-13',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws DEADLINE_OUTSIDE_CONTRACT for out-of-range date', async () => {
      prisma.content.findUnique.mockResolvedValue({
        id: 'content-1',
        contract_id: 'contract-1',
        deadline: day(10),
      });
      prisma.contracts.findUnique.mockResolvedValue({
        id: 'contract-1',
        start_date: day(-30),
        end_date: day(90),
        days_between: 14,
      });

      await expect(
        service.assignManualSlot({
          contentId: 'content-1',
          deadline: '2027-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws DEADLINE_BEFORE_TODAY for past date', async () => {
      prisma.content.findUnique.mockResolvedValue({
        id: 'content-1',
        contract_id: 'contract-1',
        deadline: day(10),
      });
      prisma.contracts.findUnique.mockResolvedValue({
        id: 'contract-1',
        start_date: day(-30),
        end_date: day(90),
        days_between: 14,
      });

      await expect(
        service.assignManualSlot({
          contentId: 'content-1',
          deadline: '2026-09-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns updated content with new deadline', async () => {
      prisma.content.findUnique.mockResolvedValue({
        id: 'content-1',
        contract_id: 'contract-1',
        deadline: day(10),
      });
      prisma.contracts.findUnique.mockResolvedValue({
        id: 'contract-1',
        start_date: day(-30),
        end_date: day(90),
        days_between: 14,
      });
      const updated = {
        id: 'content-1',
        name: 'Test Content',
        deadline: new Date('2026-10-13T00:00:00Z'),
        type: 'specific',
        status: 'scheduled',
      };
      prisma.content.update.mockResolvedValue(updated);

      const result = await service.assignManualSlot({
        contentId: 'content-1',
        deadline: '2026-10-13',
      });

      expect(result).toEqual({
        id: 'content-1',
        name: 'Test Content',
        deadline: '2026-10-13',
        type: 'specific',
        status: 'scheduled',
      });
    });
  });
});
