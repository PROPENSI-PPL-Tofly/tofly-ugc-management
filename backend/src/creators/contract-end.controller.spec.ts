import { ParseUUIDPipe, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AdminGuard } from '../auth/admin.guard.js';
import { ContractEndController } from './contract-end.controller.js';
import { ContractEndService } from './contract-end.service.js';

const CREATOR_ID = '11111111-1111-4111-8111-111111111111';
const CONTRACT_ID = '22222222-2222-4222-8222-222222222222';
// 10:00 WIB on 24 November 2026.
const NOW = new Date('2026-11-24T03:00:00Z');

const body = { invoice: 'pay', lastDay: '2026-11-30', reason: 'breach', note: 'Fraud views.' };
const signedIn = { principal: { userId: 'admin-1', role: 'admin' as const } };

function paramPipes(method: string): Record<string, unknown[]> {
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, ContractEndController, method) as Record<
    string,
    { data?: string; pipes: unknown[] }
  >;
  return Object.fromEntries(
    Object.values(args)
      .filter((arg) => typeof arg.data === 'string')
      .map((arg) => [arg.data, arg.pipes]),
  );
}

describe('ContractEndController', () => {
  let controller: ContractEndController;
  const contracts = { preview: vi.fn(), end: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    contracts.preview.mockResolvedValue({ lastDay: '2026-11-30' });
    contracts.end.mockResolvedValue({ contractId: CONTRACT_ID });

    const module = await Test.createTestingModule({
      controllers: [ContractEndController],
      providers: [{ provide: ContractEndService, useValue: contracts }],
    }).compile();
    controller = module.get(ContractEndController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // OWASP A01:2025: only a signed-in admin reaches either route.
  it('is open to signed-in admins only, under one contract of one creator', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ContractEndController)).toEqual([AdminGuard]);
    expect(Reflect.getMetadata(PATH_METADATA, ContractEndController)).toBe(
      'creators/:id/contracts/:contractId/early-end',
    );
  });

  it('serves POST /preview and POST /, both answering 200', () => {
    const route = (method: 'preview' | 'end') => ({
      path: Reflect.getMetadata(PATH_METADATA, controller[method]),
      method: Reflect.getMetadata(METHOD_METADATA, controller[method]),
      code: Reflect.getMetadata(HTTP_CODE_METADATA, controller[method]),
    });
    expect(route('preview')).toEqual({ path: 'preview', method: RequestMethod.POST, code: 200 });
    expect(route('end')).toEqual({ path: '/', method: RequestMethod.POST, code: 200 });
  });

  it('turns a malformed creator or contract id into a 400 before the service runs', () => {
    expect(paramPipes('preview')).toEqual({ id: [ParseUUIDPipe], contractId: [ParseUUIDPipe] });
    expect(paramPipes('end')).toEqual({ id: [ParseUUIDPipe], contractId: [ParseUUIDPipe] });
  });

  it('asks the service for the consequences with the time the request arrived', async () => {
    await expect(controller.preview(CREATOR_ID, CONTRACT_ID, body)).resolves.toEqual({
      lastDay: '2026-11-30',
    });
    expect(contracts.preview).toHaveBeenCalledWith(CREATOR_ID, CONTRACT_ID, body, NOW);
  });

  it('hands the end and the signed-in admin to the service', async () => {
    await expect(controller.end(CREATOR_ID, CONTRACT_ID, body, signedIn)).resolves.toEqual({
      contractId: CONTRACT_ID,
    });
    expect(contracts.end).toHaveBeenCalledWith(CREATOR_ID, CONTRACT_ID, body, NOW, 'admin-1');
  });

  it('works behind the development stand-in, which signs in no admin', async () => {
    await controller.end(CREATOR_ID, CONTRACT_ID, body, {});
    expect(contracts.end).toHaveBeenCalledWith(CREATOR_ID, CONTRACT_ID, body, NOW, undefined);
  });
});
