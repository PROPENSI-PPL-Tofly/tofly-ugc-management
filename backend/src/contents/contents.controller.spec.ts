import { ContentsController } from './contents.controller.js';
import { checkNewContent } from './new-content.js';

vi.mock('./new-content.js', () => ({
  checkNewContent: vi.fn(),
}));

describe('ContentsController', () => {
  const body = {
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
    vi.mocked(checkNewContent).mockReturnValue(undefined);

    const controller = new ContentsController({ create });

    await expect(controller.create(body)).resolves.toEqual(createdContent);

    expect(checkNewContent).toHaveBeenCalledWith(body);
    expect(create).toHaveBeenCalledWith(body);
  });
});