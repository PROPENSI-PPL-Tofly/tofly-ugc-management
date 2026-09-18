import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CreatorsController } from './creators.controller.js';
import { CreatorsService } from './creators.service.js';

describe('CreatorsController', () => {
  let controller: CreatorsController;
  const service = { list: vi.fn() };
  const response = {
    items: [],
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    service.list.mockResolvedValue(response);
    const module = await Test.createTestingModule({
      controllers: [CreatorsController],
      providers: [{ provide: CreatorsService, useValue: service }],
    }).compile();
    controller = module.get(CreatorsController);
  });

  it('hands the requested page to the service', async () => {
    await expect(controller.list(2, 25)).resolves.toBe(response);
    expect(service.list).toHaveBeenCalledWith({ page: 2, pageSize: 25 });
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
});
