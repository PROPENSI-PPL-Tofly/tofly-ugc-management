import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ContentsController } from './contents.controller.js';
import { ContentsService } from './contents.service.js';

describe('ContentsController', () => {
  let controller: ContentsController;
  const service = { assignManualSlot: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [ContentsController],
      providers: [{ provide: ContentsService, useValue: service }],
    }).compile();
    controller = module.get(ContentsController);
  });

  it('returns 200 for valid assignment', async () => {
    const result = {
      id: 'content-1',
      name: 'Test',
      type: 'specific',
      deadline: '2026-10-13',
      status: 'scheduled',
    };
    service.assignManualSlot.mockResolvedValue(result);

    await expect(
      controller.assignManualSlot({
        contentId: 'content-1',
        deadline: '2026-10-13',
      }),
    ).resolves.toEqual(result);
  });

  it('propagates CONTENT_NOT_FOUND as 404', async () => {
    service.assignManualSlot.mockRejectedValue(
      new NotFoundException({
        code: 'CONTENT_NOT_FOUND',
        message: 'Konten tidak ditemukan',
      }),
    );

    await expect(
      controller.assignManualSlot({
        contentId: 'nonexistent',
        deadline: '2026-10-13',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('propagates DEADLINE_OUTSIDE_CONTRACT as 400', async () => {
    service.assignManualSlot.mockRejectedValue(
      new BadRequestException({
        code: 'DEADLINE_OUTSIDE_CONTRACT',
        message: 'Deadline harus dalam masa kontrak',
      }),
    );

    await expect(
      controller.assignManualSlot({
        contentId: 'content-1',
        deadline: '2027-01-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
