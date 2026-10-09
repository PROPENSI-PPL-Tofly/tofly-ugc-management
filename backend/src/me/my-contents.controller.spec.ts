import { MyContentsController } from './my-contents.controller.js';

function listerStub() {
  return { list: vi.fn() };
}

function detailStub() {
  return { getDetail: vi.fn() };
}

describe('MyContentsController', () => {
  it('answers GET /me/contents/:id for the signed-in creator only', async () => {
    const detail = detailStub();
    const detailOf = { id: '11111111-1111-1111-1111-111111111111' };
    detail.getDetail.mockResolvedValue(detailOf);

    const controller = new MyContentsController(listerStub(), detail);

    await expect(
      controller.detail('creator-1', '11111111-1111-1111-1111-111111111111'),
    ).resolves.toEqual(detailOf);

    expect(detail.getDetail).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      expect.any(Date),
      { creatorId: 'creator-1' },
    );
  });
});
