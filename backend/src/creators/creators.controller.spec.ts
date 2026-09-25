import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CreatorOnboardingService } from './creator-onboarding.service.js';
import { CreatorsController } from './creators.controller.js';
import { CreatorsService } from './creators.service.js';

describe('CreatorsController', () => {
  let controller: CreatorsController;

  const service = {
    list: vi.fn(),
    findOne: vi.fn(),
  };

  const onboarding = {
    onboard: vi.fn(),
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
    onboarding.onboard.mockResolvedValue({ id: 'creator-9' });

    const module = await Test.createTestingModule({
      controllers: [CreatorsController],
      providers: [
        { provide: CreatorsService, useValue: service },
        { provide: CreatorOnboardingService, useValue: onboarding },
      ],
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

  it('accepts no_data as a productivity filter', async () => {
    await controller.list(1, 10, undefined, undefined, 'no_data');

    expect(service.list).toHaveBeenCalledWith(
      { page: 1, pageSize: 10 },
      expect.any(Date),
      { productivity: 'no_data' },
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

  describe('create', () => {
    // The validator judges dates against the request's "today"; pin it so the body stays valid.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-23T08:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const body = {
      name: 'Salsa Amelia',
      email: 'salsa@example.com',
      socialPlatform: 'tiktok',
      socialUsername: 'salsa.amelia',
      contractType: 'regular',
      contractStart: '2026-10-01',
      contractEnd: '2026-12-31',
      interval: 7,
      quota: 1,
      fixedRate: 500000,
      deadlines: ['2026-10-06'],
    };

    it('hands the validated creator to onboarding and answers with its id', async () => {
      await expect(controller.create(body)).resolves.toEqual({
        id: 'creator-9',
      });
      expect(onboarding.onboard).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Salsa Amelia',
          contractType: 'regular',
          contractStart: '2026-10-01',
          deadlines: ['2026-10-06'],
        }),
        new Date('2026-09-23T08:00:00Z'),
      );
    });

    it('rejects an invalid body with a 422 before anything is saved', async () => {
      await expect(
        controller.create({ ...body, email: 'salsa' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(onboarding.onboard).not.toHaveBeenCalled();
    });

    it('judges "today" by the date the request arrives', async () => {
      vi.setSystemTime(new Date('2026-10-02T00:00:00Z'));

      await expect(controller.create(body)).rejects.toMatchObject({
        response: {
          errors: {
            contractStart: 'Tanggal mulai tidak boleh sebelum hari ini',
          },
        },
      });
    });
  });
});
