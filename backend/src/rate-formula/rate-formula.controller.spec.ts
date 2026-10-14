import { RequestMethod, UnprocessableEntityException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AdminGuard } from '../auth/admin.guard.js';
import { RateFormulaController } from './rate-formula.controller.js';
import { RateFormulaService } from './rate-formula.service.js';

const ADMIN_USER_ID = '99999999-9999-4999-8999-999999999999';

const BODY = {
  specificBonus: 250000,
  latePenaltyPerDay: 50000,
  performanceBonusTiers: {
    instagram: [{ threshold: 10000, bonus: 100000 }],
    tiktok: [],
  },
};

const VIEW = {
  configured: true,
  ...BODY,
  updatedAt: '2026-10-14T03:00:00.000Z',
};

describe('RateFormulaController', () => {
  let controller: RateFormulaController;
  const store = {
    read: vi.fn(),
    replace: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    store.read.mockResolvedValue(VIEW);
    store.replace.mockResolvedValue(VIEW);

    const module = await Test.createTestingModule({
      controllers: [RateFormulaController],
      providers: [{ provide: RateFormulaService, useValue: store }],
    }).compile();

    controller = module.get(RateFormulaController);
  });

  it('is open to signed-in admins only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, RateFormulaController)).toEqual([
      AdminGuard,
    ]);
  });

  it('serves GET and PUT /rate-formula', () => {
    expect(Reflect.getMetadata(PATH_METADATA, RateFormulaController)).toBe(
      'rate-formula',
    );
    expect(
      Reflect.getMetadata(METHOD_METADATA, RateFormulaController.prototype.read),
    ).toBe(RequestMethod.GET);
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        RateFormulaController.prototype.replace,
      ),
    ).toBe(RequestMethod.PUT);
  });

  it('answers the stored formula', async () => {
    await expect(controller.read()).resolves.toBe(VIEW);
    expect(store.read).toHaveBeenCalledOnce();
  });

  it('saves the validated formula under the signed-in admin', async () => {
    await expect(
      controller.replace(BODY, {
        principal: { userId: ADMIN_USER_ID, role: 'admin' },
      }),
    ).resolves.toBe(VIEW);

    expect(store.replace).toHaveBeenCalledWith(BODY, ADMIN_USER_ID);
  });

  it('hands the store only the fields the formula has', async () => {
    await controller.replace(
      { ...BODY, contentFee: 1, updatedBy: 'someone-else' },
      { principal: { userId: ADMIN_USER_ID, role: 'admin' } },
    );

    expect(store.replace).toHaveBeenCalledWith(BODY, ADMIN_USER_ID);
  });

  it('saves without an admin behind the local development stand-in', async () => {
    await controller.replace(BODY, {});

    expect(store.replace).toHaveBeenCalledWith(BODY, undefined);
  });

  it('answers an invalid body with a 422 and saves nothing', async () => {
    await expect(
      controller.replace(
        { ...BODY, specificBonus: -1 },
        { principal: { userId: ADMIN_USER_ID, role: 'admin' } },
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(store.replace).not.toHaveBeenCalled();
  });
});
