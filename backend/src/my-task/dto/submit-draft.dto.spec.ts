import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SubmitDraftDto } from './submit-draft.dto.js';

function parse(body: Record<string, unknown>) {
  const instance = plainToInstance(SubmitDraftDto, body);
  return { instance, errors: validateSync(instance, { whitelist: true }) };
}

describe('SubmitDraftDto', () => {
  it('accepts a link on its own, the note being optional', () => {
    expect(
      parse({ link: 'https://drive.google.com/file/d/abc/view' }).errors,
    ).toHaveLength(0);
  });

  it('trims both fields', () => {
    const { instance, errors } = parse({
      link: '  https://drive.google.com/file/d/abc  ',
      creatorNotes: '  Versi pendek  ',
    });

    expect(errors).toHaveLength(0);
    expect(instance).toMatchObject({
      link: 'https://drive.google.com/file/d/abc',
      creatorNotes: 'Versi pendek',
    });
  });

  it.each([
    [{}],
    [{ link: '' }],
    [{ link: '   ' }],
    [{ link: 'bukan link' }],
    [{ link: 'drive.google.com/file' }],
    [{ link: 'ftp://files.example.com/draft.mp4' }],
    [{ link: 'javascript:alert(1)' }],
    [{ link: `https://example.com/${'a'.repeat(2048)}` }],
    [{ link: 'https://example.com', creatorNotes: 'x'.repeat(1001) }],
    [{ link: 'https://example.com', creatorNotes: 42 }],
  ])('rejects %o', (body) => {
    expect(parse(body).errors.length).toBeGreaterThan(0);
  });
});
