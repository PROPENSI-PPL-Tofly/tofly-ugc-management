import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { checkLinkReplacement, checkLinkSubmission } from './link-request.js';

const REEL = 'https://www.instagram.com/reel/C9xYz/';
const VIDEO = 'https://www.tiktok.com/@tofly/video/7312345678901234567';

function refusal(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected a refusal');
}

describe('checkLinkSubmission', () => {
  it('takes one link per filled platform, in the order the app lists platforms', () => {
    expect(
      checkLinkSubmission({ links: { tiktok: VIDEO, instagram: ` ${REEL} ` } }),
    ).toEqual([
      { platform: 'instagram', url: REEL },
      { platform: 'tiktok', url: VIDEO },
    ]);
  });

  it.each([undefined, null, '', '   '])(
    'leaves out a platform whose field is %j',
    (empty) => {
      expect(
        checkLinkSubmission({ links: { instagram: REEL, tiktok: empty } }),
      ).toEqual([{ platform: 'instagram', url: REEL }]);
    },
  );

  it('answers every refused field at once, each with its own message', () => {
    const error = refusal(() =>
      checkLinkSubmission({
        links: { instagram: VIDEO, tiktok: 'https://vt.tiktok.com/a/b' },
      }),
    );

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toEqual({
      message: 'Data link video tidak valid',
      errors: {
        instagram:
          'Link harus dari Instagram (instagram.com/reel/... atau /p/...)',
        tiktok:
          'Link harus dari TikTok (tiktok.com/@user/video/... atau vt.tiktok.com/...)',
      },
    });
  });

  it.each([
    ['no body', undefined],
    ['an array', [REEL]],
    ['no links object', { link: REEL }],
    ['links as a list', { links: [REEL] }],
    ['only empty fields', { links: { instagram: '', tiktok: '  ' } }],
  ])('asks for at least one link when given %s', (_what, body) => {
    const error = refusal(() => checkLinkSubmission(body));

    expect((error as UnprocessableEntityException).getResponse()).toEqual({
      message: 'Data link video tidak valid',
      errors: { links: 'Isi minimal satu link video' },
    });
  });

  it('refuses a platform the app does not know, without reading its link', () => {
    const error = refusal(() =>
      checkLinkSubmission({
        links: { instagram: REEL, youtube: 'https://youtu.be/x' },
      }),
    );

    expect((error as UnprocessableEntityException).getResponse()).toEqual({
      message: 'Data link video tidak valid',
      errors: { links: 'Platform hanya instagram atau tiktok' },
    });
  });

  it('refuses a link that is not text as a field error', () => {
    const error = refusal(() => checkLinkSubmission({ links: { tiktok: 42 } }));

    expect((error as UnprocessableEntityException).getResponse()).toEqual({
      message: 'Data link video tidak valid',
      errors: { tiktok: 'Link video wajib diisi' },
    });
  });
});

describe('checkLinkReplacement', () => {
  it('takes the platform from the route and the trimmed link from the body', () => {
    expect(checkLinkReplacement('tiktok', { url: ` ${VIDEO} ` })).toEqual({
      platform: 'tiktok',
      url: VIDEO,
    });
  });

  it.each(['youtube', 'Instagram', '__proto__', ''])(
    'answers 404 for the platform %j',
    (platform) => {
      const error = refusal(() =>
        checkLinkReplacement(platform, { url: REEL }),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toEqual({
        code: 'PLATFORM_NOT_FOUND',
        message: 'Platform tidak dikenal',
      });
    },
  );

  it.each([
    [
      'a link of the other platform',
      { url: VIDEO },
      'Link harus dari Instagram (instagram.com/reel/... atau /p/...)',
    ],
    ['no link', {}, 'Link video wajib diisi'],
    ['no body', null, 'Link video wajib diisi'],
  ])('answers 422 on the platform field for %s', (_what, body, message) => {
    const error = refusal(() => checkLinkReplacement('instagram', body));

    expect((error as UnprocessableEntityException).getResponse()).toEqual({
      message: 'Data link video tidak valid',
      errors: { instagram: message },
    });
  });
});
