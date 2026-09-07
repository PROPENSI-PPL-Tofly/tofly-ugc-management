import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  const prismaMock = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaMock }],
    }).compile();
    controller = module.get<HealthController>(HealthController);
  });

  it('returns { db: "ok" } when the DB query succeeds', async () => {
    await expect(controller.check()).resolves.toEqual({ db: 'ok' });
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
  });
});
