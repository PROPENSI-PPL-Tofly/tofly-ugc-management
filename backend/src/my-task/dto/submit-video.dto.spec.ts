import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SubmitVideoDto } from './submit-video.dto.js';

function parse(body: Record<string, unknown>) {
  const instance = plainToInstance(SubmitVideoDto, body);
  return { instance, errors: validateSync(instance, { whitelist: true }) };
}

describe('SubmitVideoDto', () => {
  it.each([
    'https://www.instagram.com/reel/C8abc/',
    'https://vm.tiktok.com/ZSabc123/',
  ])('accepts %s', (link) => {
    expect(parse({ link }).errors).toHaveLength(0);
  });

  it('trims the link', () => {
    const { instance, errors } = parse({
      link: '  https://www.tiktok.com/@a/video/1  ',
    });

    expect(errors).toHaveLength(0);
    expect(instance.link).toBe('https://www.tiktok.com/@a/video/1');
  });

  it('explains a link from any other platform', () => {
    const { errors } = parse({ link: 'https://youtube.com/shorts/abc' });

    expect(errors[0].constraints).toEqual({
      isVideoLink: 'link must be an Instagram or TikTok URL',
    });
  });

  it.each([
    [{}],
    [{ link: '' }],
    [{ link: 42 }],
    [{ link: 'https://instagram.com.evil.example/reel' }],
    [{ link: `https://instagram.com/${'a'.repeat(2048)}` }],
  ])('rejects %o', (body) => {
    expect(parse(body).errors.length).toBeGreaterThan(0);
  });
});
