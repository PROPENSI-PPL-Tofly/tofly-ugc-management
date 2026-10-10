import { UnprocessableEntityException } from '@nestjs/common';
import { CreatorCommentController } from './creator-comment.controller.js';
import type { CreatorCommentWriter } from './creator-comment.service.js';

const CONTENT_ID = 'a08576d2-15a7-4ed0-bf4b-f5a28c2d65a0';
const CREATOR_ID = 'b08576d2-15a7-4ed0-bf4b-f5a28c2d65a0';

function createHarness() {
  const addComment = vi.fn(
    async (
      _contentId: string,
      _creatorId: string,
      _input: { comment: string },
    ): Promise<void> => undefined,
  );

  const writer: CreatorCommentWriter = {
    addComment,
  };

  return {
    controller: new CreatorCommentController(writer),
    addComment,
  };
}

describe('CreatorCommentController.addComment', () => {
  it('validates and forwards the trimmed comment to the service', async () => {
    const { controller, addComment } = createHarness();

    await expect(
      controller.addComment(CONTENT_ID, CREATOR_ID, {
        comment: '  The revised draft is ready.  ',
      }),
    ).resolves.toBeUndefined();

    expect(addComment).toHaveBeenCalledTimes(1);
    expect(addComment).toHaveBeenCalledWith(CONTENT_ID, CREATOR_ID, {
      comment: 'The revised draft is ready.',
    });
  });

  it('rejects an invalid comment before calling the service', async () => {
    const { controller, addComment } = createHarness();

    await expect(
      controller.addComment(CONTENT_ID, CREATOR_ID, {
        comment: '   ',
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(addComment).not.toHaveBeenCalled();
  });

  it('propagates service errors', async () => {
    const { controller, addComment } = createHarness();
    const serviceError = new Error('Comment persistence failed');

    addComment.mockRejectedValueOnce(serviceError);

    await expect(
      controller.addComment(CONTENT_ID, CREATOR_ID, {
        comment: 'A valid comment.',
      }),
    ).rejects.toBe(serviceError);
  });
});
