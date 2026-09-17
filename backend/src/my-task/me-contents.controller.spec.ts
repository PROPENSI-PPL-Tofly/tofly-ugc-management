import { Test, type TestingModule } from '@nestjs/testing';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { MeContentsController } from './me-contents.controller.js';
import { MyTaskService } from './my-task.service.js';

describe('MeContentsController', () => {
  let controller: MeContentsController;
  let list: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    list = vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 5,
      total: 0,
      totalPages: 1,
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeContentsController],
      providers: [{ provide: MyTaskService, useValue: { list } }],
    })
      .overrideGuard(DevCreatorGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(MeContentsController);
  });

  it('lists the signed-in creator’s content with the query untouched', async () => {
    await expect(
      controller.list('creator-1', { page: 2 }),
    ).resolves.toMatchObject({ total: 0 });
    expect(list).toHaveBeenCalledWith('creator-1', { page: 2 });
  });
});
