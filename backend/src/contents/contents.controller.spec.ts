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

    const controller = new ContentsController({ create }, { getForContent: vi.fn() });
    const request = {
      headers: {},
      principal: { userId: '11111111-1111-4111-8111-111111111111', role: 'admin' as const },
    };

    await expect(controller.create(body, request)).resolves.toEqual(createdContent);

    expect(checkNewContent).toHaveBeenCalledWith(body);
    expect(create).toHaveBeenCalledWith(body, request.principal.userId);
  });
});
