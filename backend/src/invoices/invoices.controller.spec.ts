import {
  BadRequestException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
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
  const service = {
    list: vi.fn(),
    addAdjustment: vi.fn(),
    finalize: vi.fn(),
  };
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

  describe('manual adjustments and finalize', () => {
    const contractId = '11111111-1111-4111-8111-111111111111';
    const admin = { principal: { userId: 'admin-1', role: 'admin' as const } };

    // OWASP Top 10:2025 A01 (Broken Access Control): the actor is the signed-in admin.
    it('records the adjustment as the signed-in admin with the checked body', async () => {
      const saved = { id: 'adj-1', invoiceStatus: 'running' };
      service.addAdjustment.mockResolvedValue(saved);

      await expect(
        controller.addAdjustment(
          contractId,
          { amount: 25_000, reason: '  Approved campaign adjustment ' },
          admin,
        ),
      ).resolves.toBe(saved);
      expect(service.addAdjustment).toHaveBeenCalledWith(
        contractId,
        { amount: 25_000, reason: 'Approved campaign adjustment' },
        'admin-1',
      );
    });

    // OWASP Top 10:2025 A10 (Mishandling of Exceptional Conditions): nothing is written on bad input.
    it('rejects an invalid adjustment without asking the service', async () => {
      await expect(
        controller.addAdjustment(contractId, { amount: 0, reason: '' }, admin),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(service.addAdjustment).not.toHaveBeenCalled();
    });

    it('finalizes as of the time of the request', async () => {
      const finalized = { invoiceStatus: 'finalized' };
      service.finalize.mockResolvedValue(finalized);

      await expect(controller.finalize(contractId, admin)).resolves.toBe(
        finalized,
      );
      expect(service.finalize).toHaveBeenCalledWith(
        contractId,
        expect.any(Date),
      );
    });

    // OWASP Top 10:2025 A01 (Broken Access Control): defence in depth behind AdminGuard.
    it.each([
      ['no principal', {}],
      [
        'a creator principal',
        {
          principal: {
            userId: 'user-2',
            role: 'creator' as const,
            creatorId: 'creator-2',
          },
        },
      ],
    ])('refuses both writes for %s', async (_case, request) => {
      await expect(
        controller.addAdjustment(
          contractId,
          { amount: 10, reason: 'Koreksi' },
          request,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        controller.finalize(contractId, request),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(service.addAdjustment).not.toHaveBeenCalled();
      expect(service.finalize).not.toHaveBeenCalled();
    });
  });
});
