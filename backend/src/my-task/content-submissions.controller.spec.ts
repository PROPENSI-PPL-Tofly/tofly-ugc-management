import { Test, type TestingModule } from '@nestjs/testing';
import { DevCreatorGuard } from '../auth/dev-creator.guard.js';
import { ContentSubmissionsController } from './content-submissions.controller.js';
import { MyTaskService } from './my-task.service.js';

describe('ContentSubmissionsController', () => {
  let controller: ContentSubmissionsController;
  let submitDraft: ReturnType<typeof vi.fn>;
  let submitVideo: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    submitDraft = vi
      .fn()
      .mockResolvedValue({ id: 'content-1', status: 'draft_review' });
    submitVideo = vi
      .fn()
      .mockResolvedValue({ id: 'content-1', status: 'link_submitted' });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentSubmissionsController],
      providers: [
        { provide: MyTaskService, useValue: { submitDraft, submitVideo } },
      ],
    })
      .overrideGuard(DevCreatorGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ContentSubmissionsController);
  });

  it('submits a draft as the signed-in creator', async () => {
    const body = { link: 'https://drive.example/draft' };

    await expect(
      controller.submitDraft('creator-1', 'content-1', body),
    ).resolves.toMatchObject({
      status: 'draft_review',
    });
    expect(submitDraft).toHaveBeenCalledWith('creator-1', 'content-1', body);
  });

  it('submits a video link as the signed-in creator', async () => {
    const body = { link: 'https://www.instagram.com/reel/C8abc/' };

    await expect(
      controller.submitVideo('creator-1', 'content-1', body),
    ).resolves.toMatchObject({ status: 'link_submitted' });
    expect(submitVideo).toHaveBeenCalledWith('creator-1', 'content-1', body);
  });
});
