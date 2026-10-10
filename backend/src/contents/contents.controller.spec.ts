import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard, type AdminRequest } from '../auth/admin.guard.js';
import type { ContentEventRecord } from './content-event-history.service.js';
import { ContentsController } from './contents.controller.js';
import { checkNewContent, type NewContent } from './new-content.js';

vi.mock('./new-content.js', () => ({
  checkNewContent: vi.fn(),
}));

describe('ContentsController', () => {
  it('is open to signed-in admins only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ContentsController)).toEqual([
      AdminGuard,
    ]);
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

    const controller = new ContentsController(
      { create },
      { getForContent: vi.fn() },
    );

    const request: AdminRequest = {
      headers: {},
      principal: {
        userId: '11111111-1111-4111-8111-111111111111',
        role: 'admin',
      },
    };

    await expect(controller.create(body, request)).resolves.toEqual(
      createdContent,
    );

    expect(checkNewContent).toHaveBeenCalledWith(body);
    expect(create).toHaveBeenCalledWith(body, request.principal.userId);
  });

  it('rejects a request without an authenticated principal', async () => {
    const create = vi.fn().mockResolvedValue(createdContent);
    vi.mocked(checkNewContent).mockReturnValue(body);

    const controller = new ContentsController(
      { create },
      { getForContent: vi.fn() },
    );

    const request: AdminRequest = {
      headers: {},
    };

    await expect(controller.create(body, request)).rejects.toMatchObject({
      status: 401,
      response: {
        code: 'UNAUTHENTICATED',
        message: 'Silakan masuk terlebih dahulu',
      },
    });

    expect(checkNewContent).toHaveBeenCalledWith(body);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a request authenticated as a creator', async () => {
    const create = vi.fn().mockResolvedValue(createdContent);
    vi.mocked(checkNewContent).mockReturnValue(body);

    const controller = new ContentsController(
      { create },
      { getForContent: vi.fn() },
    );

    const request: AdminRequest = {
      headers: {},
      principal: {
        userId: '22222222-2222-4222-8222-222222222222',
        role: 'creator',
        creatorId: '33333333-3333-4333-8333-333333333333',
      },
    };

    await expect(controller.create(body, request)).rejects.toMatchObject({
      status: 401,
      response: {
        code: 'UNAUTHENTICATED',
        message: 'Silakan masuk terlebih dahulu',
      },
    });

    expect(create).not.toHaveBeenCalled();
  });

  it('returns event history for the requested content', async () => {
    const contentId = 'a08576d2-15a7-4ed0-bf4b-f5a28c2d65a0';

    const events: ContentEventRecord[] = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        content_id: contentId,
        event_type: 'Scheduled',
        actor_name: 'Ayu Admin',
        actor_role: 'admin',
        occurred_at: new Date('2026-10-01T10:00:00.000Z'),
        event_data: {},
      },
    ];

    const getForContent = vi.fn().mockResolvedValue(events);

    const controller = new ContentsController(
      { create: vi.fn() },
      { getForContent },
    );

    await expect(controller.getEventHistory(contentId)).resolves.toEqual(
      events,
    );

    expect(getForContent).toHaveBeenCalledTimes(1);
    expect(getForContent).toHaveBeenCalledWith(contentId);
  });
});
