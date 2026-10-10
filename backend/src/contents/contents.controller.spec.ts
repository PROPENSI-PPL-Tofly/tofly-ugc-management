import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../auth/admin.guard.js';
import { ContentsController } from './contents.controller.js';
import { checkNewContent, type NewContent } from './new-content.js';

vi.mock('./new-content.js', () => ({
  checkNewContent: vi.fn(),
}));

describe('ContentsController', () => {
  it('is open to signed-in admins only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ContentsController)).toEqual([AdminGuard]);
  });

  const body: NewContent = {
    contractId: '550e8400-e29b-41d4-a716-446655440000',
    type: 'specific',
    deadline: '2026-10-10',
    name: 'Product launch',
    brief: 'Introduce the new product.',
  };

  const createdContent = {
    id: 'a08576d2-15a7-4ed0-bf4b-f5a28c2d65a0',
    ...body,
  };

  it('validates the request and forwards it to the creation service', async () => {
    const create = vi.fn().mockResolvedValue(createdContent);
    vi.mocked(checkNewContent).mockReturnValue(body);

    const controller = new ContentsController({ create }, { getDetail: vi.fn() });

    await expect(controller.create(body)).resolves.toEqual(createdContent);

    expect(checkNewContent).toHaveBeenCalledWith(body);
    expect(create).toHaveBeenCalledWith(body);
  });

  it('answers GET /contents/:id from the detail service', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    const getDetail = vi.fn().mockResolvedValue({ id });
    const controller = new ContentsController({ create: vi.fn() }, { getDetail });

    await expect(controller.getDetail(id)).resolves.toEqual({ id });

    expect(getDetail).toHaveBeenCalledWith(id, expect.any(Date));
  });
});
