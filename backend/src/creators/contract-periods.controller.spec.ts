import {
  ConflictException,
  ParseUUIDPipe,
  RequestMethod,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AdminGuard } from '../auth/admin.guard.js';
import { DeadlineBufferService } from '../deadline-buffer/deadline-buffer.service.js';
import { ContractPeriodsController } from './contract-periods.controller.js';
import { ContractPeriodsService } from './contract-periods.service.js';

const CREATOR_ID = '11111111-1111-4111-8111-111111111111';
const CONTRACT_ID = '33333333-3333-4333-8333-333333333333';
// 15:00 WIB on 18 November 2026.
const NOW = new Date('2026-11-18T08:00:00Z');

const body = {
  contractType: 'regular',
  contractStart: '2026-12-01',
  contractEnd: '2027-01-31',
  interval: 14,
  quota: 1,
  fixedRate: 1_500_000,
  deadlines: ['2026-12-06'],
};

const TERMS = {
  contractType: 'regular',
  contractStart: new Date('2026-12-01T00:00:00Z'),
  contractEnd: new Date('2027-01-31T00:00:00Z'),
  interval: 14,
  quota: 1,
  fixedRate: 1_500_000,
  deadlines: [new Date('2026-12-06T00:00:00Z')],
};

const signedIn = { principal: { userId: 'admin-1', role: 'admin' as const } };

/** The pipes Nest runs on each route parameter, keyed by parameter name. */
function paramPipes(method: string): Record<string, unknown[]> {
  const args = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    ContractPeriodsController,
    method,
  ) as Record<string, { data?: string; pipes: unknown[] }>;
  return Object.fromEntries(
    Object.values(args)
      .filter((arg) => typeof arg.data === 'string')
      .map((arg) => [arg.data, arg.pipes]),
  );
}

describe('ContractPeriodsController', () => {
  let controller: ContractPeriodsController;
  const periods = {
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    assertEditable: vi.fn(),
  };
  // The stored deadline buffer (SCRUM-298).
  const buffer = { current: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    periods.create.mockResolvedValue({ contractId: CONTRACT_ID });
    periods.update.mockResolvedValue({ contractId: CONTRACT_ID });
    periods.remove.mockResolvedValue(undefined);
    periods.assertEditable.mockResolvedValue(undefined);
    buffer.current.mockResolvedValue(5);

    const module = await Test.createTestingModule({
      controllers: [ContractPeriodsController],
      providers: [
        { provide: ContractPeriodsService, useValue: periods },
        { provide: DeadlineBufferService, useValue: buffer },
      ],
    }).compile();
    controller = module.get(ContractPeriodsController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is open to signed-in admins only, under a creator', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ContractPeriodsController),
    ).toEqual([AdminGuard]);
    expect(Reflect.getMetadata(PATH_METADATA, ContractPeriodsController)).toBe(
      'creators/:id/contracts',
    );
  });

  it('serves POST /, PUT /:contractId and DELETE /:contractId, the delete answering 204', () => {
    const route = (method: string) => ({
      path: Reflect.getMetadata(
        PATH_METADATA,
        controller[method as keyof typeof controller],
      ),
      method: Reflect.getMetadata(
        METHOD_METADATA,
        controller[method as keyof typeof controller],
      ),
    });
    expect(route('create')).toEqual({ path: '/', method: RequestMethod.POST });
    expect(route('update')).toEqual({
      path: ':contractId',
      method: RequestMethod.PUT,
    });
    expect(route('remove')).toEqual({
      path: ':contractId',
      method: RequestMethod.DELETE,
    });
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller.remove)).toBe(
      204,
    );
  });

  it('turns a malformed creator or contract id into a 400 before the service runs', () => {
    expect(paramPipes('create')).toEqual({ id: [ParseUUIDPipe] });
    expect(paramPipes('update')).toEqual({
      id: [ParseUUIDPipe],
      contractId: [ParseUUIDPipe],
    });
    expect(paramPipes('remove')).toEqual({
      id: [ParseUUIDPipe],
      contractId: [ParseUUIDPipe],
    });
  });

  it('hands the validated period and the signed-in admin to the service', async () => {
    await expect(
      controller.create(CREATOR_ID, body, signedIn),
    ).resolves.toEqual({
      contractId: CONTRACT_ID,
    });
    expect(periods.create).toHaveBeenCalledWith(
      CREATOR_ID,
      TERMS,
      NOW,
      'admin-1',
    );
  });

  it('hands an edit of a period to the service the same way', async () => {
    await expect(
      controller.update(CREATOR_ID, CONTRACT_ID, body, signedIn),
    ).resolves.toEqual({
      contractId: CONTRACT_ID,
    });
    expect(periods.update).toHaveBeenCalledWith(
      CREATOR_ID,
      CONTRACT_ID,
      TERMS,
      NOW,
      'admin-1',
    );
  });

  it('works behind the development stand-in, which signs in no admin', async () => {
    await controller.create(CREATOR_ID, body, {});
    await controller.update(CREATOR_ID, CONTRACT_ID, body, {});

    expect(periods.create).toHaveBeenCalledWith(
      CREATOR_ID,
      TERMS,
      NOW,
      undefined,
    );
    expect(periods.update).toHaveBeenCalledWith(
      CREATOR_ID,
      CONTRACT_ID,
      TERMS,
      NOW,
      undefined,
    );
  });

  it('refuses an invalid body with a 422 before anything is saved', async () => {
    await expect(
      controller.create(CREATOR_ID, { ...body, quota: 0 }, signedIn),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      controller.update(
        CREATOR_ID,
        CONTRACT_ID,
        { ...body, contractStart: '2026-11-17' },
        signedIn,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(periods.create).not.toHaveBeenCalled();
    expect(periods.update).not.toHaveBeenCalled();
  });

  it('answers an edit of a started period with its 409 before judging the body', async () => {
    const started = new ConflictException({
      code: 'PERIOD_STARTED',
      message: 'Periode sudah dimulai dan tidak bisa diubah',
    });
    periods.assertEditable.mockRejectedValue(started);

    await expect(
      controller.update(
        CREATOR_ID,
        CONTRACT_ID,
        { ...body, contractStart: '2026-11-17' },
        signedIn,
      ),
    ).rejects.toBe(started);
    expect(periods.assertEditable).toHaveBeenCalledWith(
      CREATOR_ID,
      CONTRACT_ID,
      NOW,
    );
    expect(periods.update).not.toHaveBeenCalled();
  });

  // PBI-23 AC 22 (SCRUM-298): Perpanjang Kontrak and its edit are judged by the stored buffer,
  // read once for each request.
  it('judges a new or edited period by the stored buffer', async () => {
    buffer.current.mockResolvedValue(9);
    const tooEarly = {
      response: { errors: { deadlines: 'Deadline paling cepat 10 Des 2026' } },
    };

    await expect(controller.create(CREATOR_ID, body, signedIn)).rejects.toMatchObject(tooEarly);
    await expect(
      controller.update(CREATOR_ID, CONTRACT_ID, body, signedIn),
    ).rejects.toMatchObject(tooEarly);
    expect(buffer.current).toHaveBeenCalledTimes(2);
    expect(periods.create).not.toHaveBeenCalled();
    expect(periods.update).not.toHaveBeenCalled();
  });

  it('hands a delete to the service with the time the request arrived', async () => {
    await expect(controller.remove(CREATOR_ID, CONTRACT_ID, signedIn)).resolves.toBeUndefined();
    expect(periods.remove).toHaveBeenCalledWith(CREATOR_ID, CONTRACT_ID, NOW, 'admin-1');
  });

  it('hands a delete behind the development stand-in with no admin', async () => {
    await controller.remove(CREATOR_ID, CONTRACT_ID, {});

    expect(periods.remove).toHaveBeenCalledWith(CREATOR_ID, CONTRACT_ID, NOW, undefined);
  });
});
