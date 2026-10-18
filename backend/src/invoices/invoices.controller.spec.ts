import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AdminGuard } from '../auth/admin.guard.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';

describe('InvoicesController', () => {
  it('is open to signed-in admins only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, InvoicesController)).toEqual([
      AdminGuard,
    ]);
  });

  let controller: InvoicesController;
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
      controllers: [InvoicesController],
      providers: [{ provide: InvoicesService, useValue: service }],
    }).compile();

    controller = module.get(InvoicesController);
  });

  it('hands the requested page, today and no filters to the service', async () => {
    await expect(controller.list(2, 25)).resolves.toBe(response);
    expect(service.list).toHaveBeenCalledWith(
      { page: 2, pageSize: 25 },
      expect.any(Date),
      {},
    );
  });

  it('hands the search word and the contract status on, trimmed and checked', async () => {
    await controller.list(1, 10, '  Rangga ', 'active');
    expect(service.list).toHaveBeenCalledWith(
      { page: 1, pageSize: 10 },
      expect.any(Date),
      { q: 'Rangga', contract: 'active' },
    );
  });

  it('rejects a contract status the table does not offer without asking the service', async () => {
    await expect(
      controller.list(1, 10, undefined, 'none'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('rejects a page below one without asking the service', async () => {
    await expect(controller.list(0, 10)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(service.list).not.toHaveBeenCalled();
  });

  it('caps the page size so one request cannot pull every invoice', async () => {
    await expect(controller.list(1, 51)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.list(1, 50)).resolves.toBe(response);
  });
});
