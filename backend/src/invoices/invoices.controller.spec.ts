import {
  BadRequestException,
  NotFoundException,
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
    detail: vi.fn(),
    addAdjustment: vi.fn(),
    finalize: vi.fn(),
  };

  const response = {
    items: [],
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    summary: {
      total: 0,
      runningInvoices: 0,
      formulaSet: false,
    },
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
      { key: 'action', order: 'asc' },
    );
  });

  it('hands the trimmed search word and checked contract status to the service', async () => {
    await controller.list(1, 10, '  Rangga ', 'active');

    expect(service.list).toHaveBeenCalledWith(
      { page: 1, pageSize: 10 },
      expect.any(Date),
      { q: 'Rangga', contract: 'active' },
      { key: 'action', order: 'asc' },
    );
  });

  it('rejects an unsupported contract status without asking the service', async () => {
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

  it('hands the checked invoice status filter to the service', async () => {
    await controller.list(1, 10, undefined, undefined, 'paid');

    expect(service.list).toHaveBeenCalledWith(
      { page: 1, pageSize: 10 },
      expect.any(Date),
      { status: 'paid' },
      { key: 'action', order: 'asc' },
    );
  });

  it('rejects an unsupported invoice status without asking the service', async () => {
    await expect(
      controller.list(1, 10, undefined, undefined, 'hacked'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(service.list).not.toHaveBeenCalled();
  });

  it("answers one creator's invoice as of today", async () => {
    const detail = { creatorId: 'creator-1' };
    service.detail.mockResolvedValue(detail);

    await expect(controller.detail('creator-1')).resolves.toBe(detail);

    expect(service.detail).toHaveBeenCalledWith(
      'creator-1',
      expect.any(Date),
      undefined,
    );
  });

  it("answers the invoice of the creator's contract it is asked for", async () => {
    service.detail.mockResolvedValue({ creatorId: 'creator-1' });

    await controller.detail('creator-1', 'contract-1');

    expect(service.detail).toHaveBeenCalledWith(
      'creator-1',
      expect.any(Date),
      'contract-1',
    );
  });

  it('answers 404 with a readable code when the creator has no invoice', async () => {
    service.detail.mockResolvedValue(null);

    await expect(controller.detail('creator-1')).rejects.toMatchObject({
      response: { code: 'INVOICE_NOT_FOUND' },
    });
    expect(service.detail).toHaveBeenCalledWith(
      'creator-1',
      expect.any(Date),
      undefined,
    );
  });

  it('tells the admin in Indonesian why there is no invoice', async () => {
    service.detail.mockResolvedValue(null);

    await expect(controller.detail('creator-1')).rejects.toMatchObject({
      response: {
        message: 'Creator tidak ditemukan atau belum punya kontrak',
      },
    });
  });

  it('hands the requested sort order to the service', async () => {
    await controller.list(
      1,
      10,
      undefined,
      undefined,
      undefined,
      'total',
      'desc',
    );

    expect(service.list).toHaveBeenCalledWith(
      { page: 1, pageSize: 10 },
      expect.any(Date),
      {},
      { key: 'total', order: 'desc' },
    );
  });

  it('rejects an unsupported sort key or direction', async () => {
    await expect(
      controller.list(1, 10, undefined, undefined, undefined, 'bonus'),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      controller.list(
        1,
        10,
        undefined,
        undefined,
        undefined,
        'name',
        'sideways',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(service.list).not.toHaveBeenCalled();
  });

  describe('manual adjustments and finalize', () => {
    const contractId = '11111111-1111-4111-8111-111111111111';
    const admin = {
      principal: { userId: 'admin-1', role: 'admin' as const },
    };

    // OWASP Top 10:2025 A01 — actor identity must come from the authenticated principal.
    it('records the adjustment as the signed-in admin with the checked body', async () => {
      const saved = { id: 'adj-1', invoiceStatus: 'accruing' };
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

    // OWASP Top 10:2025 A10 — invalid input must not reach the service.
    it('rejects an invalid adjustment without asking the service', async () => {
      await expect(
        controller.addAdjustment(contractId, { amount: 0, reason: '' }, admin),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(service.addAdjustment).not.toHaveBeenCalled();
    });

    it('finalizes as of the time of the request', async () => {
      const finalized = { invoiceStatus: 'finalized' };
      service.finalize.mockResolvedValue(finalized);

      await expect(controller.finalize(contractId, {}, admin)).resolves.toBe(
        finalized,
      );

      expect(service.finalize).toHaveBeenCalledWith(
        contractId,
        expect.any(Date),
        { acceptPendingBonus: false },
      );
    });

    it('passes on that the admin accepted freezing a pending bonus', async () => {
      service.finalize.mockResolvedValue({ invoiceStatus: 'finalized' });

      await controller.finalize(contractId, { acceptPendingBonus: true }, admin);

      expect(service.finalize).toHaveBeenCalledWith(
        contractId,
        expect.any(Date),
        { acceptPendingBonus: true },
      );
    });

    // OWASP Top 10:2025 A08 — a body trying to set what the server decides never reaches it.
    it('rejects a finalize body it does not take without asking the service', async () => {
      await expect(
        controller.finalize(contractId, { status: 'finalized' }, admin),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(service.finalize).not.toHaveBeenCalled();
    });

    // OWASP Top 10:2025 A01 — reject missing and non-admin principals.
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
        controller.finalize(contractId, {}, request),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(service.addAdjustment).not.toHaveBeenCalled();
      expect(service.finalize).not.toHaveBeenCalled();
    });
  });
});