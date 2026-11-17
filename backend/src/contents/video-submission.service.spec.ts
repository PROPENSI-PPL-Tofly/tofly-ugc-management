import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CreatorLinkActor } from './link-change.js';
import type { LinkChanger } from './link-change.service.js';
import { VideoSubmissionService } from './video-submission.service.js';

const CONTENT_ID = '7d0c5f1e-3b1a-4c2e-9f4d-2a6b8c0d1e2f';
const CREATOR_ID = '0b5e2c9a-6f3d-4e1b-8a7c-9d2f4e6a8b1c';
const REEL = 'https://www.instagram.com/reel/C9xYz/';
const VIDEO = 'https://www.tiktok.com/@tofly/video/7312345678901234567';

// POST /contents/:id/video is the one-link form Task Saya still sends until the multi-platform
// modal (38.3) replaces it. It is now a thin adapter over the link service, so both routes share
// every rule: the window, the invoice lock, the accounts on file and the one-video-one-content key.
describe('VideoSubmissionService', () => {
  const links = {
    submit: vi.fn<LinkChanger['submit']>(),
    replace: vi.fn<LinkChanger['replace']>(),
  } satisfies LinkChanger;
  const service = new VideoSubmissionService(links);

  beforeEach(() => {
    links.submit.mockReset().mockResolvedValue({
      contentId: CONTENT_ID,
      status: 'link_submitted',
      submittedAt: '2026-10-10',
      links: [{ platform: 'instagram', url: REEL, submittedAt: '2026-10-10' }],
    });
  });

  it.each([
    ['instagram', REEL],
    ['tiktok', VIDEO],
  ] as const)(
    "hands a %s link to the link service as the creator's only link and answers in the old shape",
    async (platform, link) => {
      const submitted = await service.submit(CONTENT_ID, CREATOR_ID, {
        videoLink: ` ${link} `,
      });

      expect(links.submit).toHaveBeenCalledWith(
        CONTENT_ID,
        new CreatorLinkActor(CREATOR_ID),
        [{ platform, url: link }],
      );
      expect(submitted).toEqual({
        contentId: CONTENT_ID,
        status: 'link_submitted',
        videoLink: link,
        platform,
        submittedAt: '2026-10-10T00:00:00.000Z',
      });
    },
  );

  it('refuses a link of neither platform before the link service is asked', async () => {
    await expect(
      service.submit(CONTENT_ID, CREATOR_ID, {
        videoLink: 'https://youtu.be/abc',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(links.submit).not.toHaveBeenCalled();
  });

  it("holds a link on a platform's host to that platform's rule, on the field the old form shows", async () => {
    const refusal = await service
      .submit(CONTENT_ID, CREATOR_ID, {
        videoLink: 'https://www.instagram.com/tofly.id/',
      })
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(UnprocessableEntityException);
    expect((refusal as UnprocessableEntityException).getResponse()).toEqual({
      message: 'Data link video tidak valid',
      errors: {
        videoLink:
          'Link harus dari Instagram (instagram.com/reel/... atau /p/...)',
      },
    });
    expect(links.submit).not.toHaveBeenCalled();
  });

  it("lets the link service's refusals through as they are", async () => {
    const taken = new ConflictException({
      code: 'VIDEO_LINK_TAKEN',
      message: 'Link ini sudah dipakai di konten lain',
    });
    links.submit.mockRejectedValue(taken);

    await expect(
      service.submit(CONTENT_ID, CREATOR_ID, { videoLink: REEL }),
    ).rejects.toBe(taken);
  });
});
