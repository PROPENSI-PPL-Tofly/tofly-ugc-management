import { Test, type TestingModule } from '@nestjs/testing';
import { CreatorsController } from './creators.controller.js';
import { CreatorsService } from './creators.service.js';

describe('CreatorsController', () => {
  let controller: CreatorsController;
  let list: ReturnType<typeof vi.fn>;
  let findOne: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    list = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    findOne = vi.fn().mockResolvedValue({ id: 'creator-1' });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreatorsController],
      providers: [{ provide: CreatorsService, useValue: { list, findOne } }],
    }).compile();

    controller = module.get(CreatorsController);
  });

  it('passes the query through to the service untouched', async () => {
    const query = { q: 'rangga', contract: 'active' as const, page: 2 };

    await controller.list(query);

    expect(list).toHaveBeenCalledWith(query);
  });

  it('returns whatever the service assembled', async () => {
    await expect(controller.list({})).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
    });
  });

  it('looks a single creator up by id', async () => {
    await expect(controller.findOne('creator-1')).resolves.toEqual({ id: 'creator-1' });
    expect(findOne).toHaveBeenCalledWith('creator-1');
  });
});
