import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CreatorsController } from './creators.controller.js';
import { CreatorsService } from './creators.service.js';

describe('CreatorsController', () => {
  let controller: CreatorsController;

  const service = {
    list: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
  };

  const response = {
    items: [],
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  };

  const detailResponse = {
    id: 'creator-1',
    name: 'Rangga Pratama',
    email: 'rangga@example.com',
    socials: {
      instagram: 'rangga.creates',
      tiktok: 'ranggacreates',
    },
    accessRevokeDate: null,
    phoneNumber: '081234567001',
    contract: {
      status: 'active',
      startDate: '2026-06-10',
      endDate: '2026-12-07',
      daysRemaining: 80,
      periodNumber: 1,
      contentQuota: 6,
    },
    progress: {
      submitted: 1,
      total: 2,
      percent: 50,
    },
    performance: {
      onTimeRate: 100,
      avgRevisions: 1,
      productivity: 'good',
      productivityLabel: 'Baik',
    },
    contractHistory: [],
    contents: [],
    drafts: [],
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    service.list.mockResolvedValue(response);
    service.findOne.mockResolvedValue(detailResponse);

    const module = await Test.createTestingModule({
      controllers: [CreatorsController],
      providers: [{ provide: CreatorsService, useValue: service }],
    }).compile();

    controller = module.get(CreatorsController);
  });

  it('hands the requested page to the service', async () => {
    await expect(controller.list(2, 25)).resolves.toBe(response);
    expect(service.list).toHaveBeenCalledWith(
      { page: 2, pageSize: 25 },
      expect.any(Date),
      {},
    );
  });

  it('rejects a page below one', async () => {
    await expect(controller.list(0, 10)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(service.list).not.toHaveBeenCalled();
  });

  it('rejects an empty page size', async () => {
    await expect(controller.list(1, 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('caps the page size so one request cannot pull the whole roster', async () => {
    await expect(controller.list(1, 51)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.list(1, 50)).resolves.toBe(response);
  });

  it('passes q, contractStatus and productivity through to the service', async () => {
    await controller.list(1, 10, 'nadia', 'active', 'good');

    expect(service.list).toHaveBeenCalledWith(
      { page: 1, pageSize: 10 },
      expect.any(Date),
      {
        q: 'nadia',
        contractStatus: 'active',
        productivity: 'good',
      },
    );
  });

  it('rejects an unrecognised contractStatus value', async () => {
    await expect(
      controller.list(1, 10, undefined, 'bogus'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unrecognised productivity value', async () => {
    await expect(
      controller.list(1, 10, undefined, undefined, 'bogus'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a search string over 100 characters', async () => {
    await expect(
      controller.list(1, 10, 'a'.repeat(101)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delegates creator detail requests to the service', async () => {
    const findOne = (
      controller as unknown as {
        findOne?: (id: string) => Promise<unknown>;
      }
    ).findOne;

    expect(findOne).toBeTypeOf('function');

    if (typeof findOne !== 'function') {
      return;
    }

    await expect(findOne.call(controller, 'creator-1')).resolves.toBe(
      detailResponse,
    );

    expect(service.findOne).toHaveBeenCalledWith('creator-1');
  });

  it('creates a creator via POST', async () => {
    service.create.mockResolvedValue({ id: 'creator-1' });

    const result = await controller.create({
      firstName: 'Rangga',
      email: 'rangga@example.com',
      contractStart: '2026-10-01',
      contractEnd: '2026-12-31',
      contentQuota: 6,
      daysBetween: 14,
      fixedRate: 500000,
    });

    expect(result).toEqual({ id: 'creator-1' });
    expect(service.create).toHaveBeenCalledWith({
      firstName: 'Rangga',
      email: 'rangga@example.com',
      contractStart: '2026-10-01',
      contractEnd: '2026-12-31',
      contentQuota: 6,
      daysBetween: 14,
      fixedRate: 500000,
    });
  });

  it('creates a creator with manualSlotDate', async () => {
    service.create.mockResolvedValue({ id: 'creator-1' });

    await controller.create({
      firstName: 'Rangga',
      email: 'rangga@example.com',
      contractStart: '2026-10-01',
      contractEnd: '2026-12-31',
      contentQuota: 6,
      daysBetween: 14,
      fixedRate: 500000,
      manualSlotDate: '2026-10-15',
    });

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ manualSlotDate: '2026-10-15' }),
    );
  });
});