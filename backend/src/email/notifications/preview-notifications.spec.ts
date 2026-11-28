import { NOTIFICATION_TEMPLATES } from './notification-templates.js';
import {
  PREVIEW_APP_URL,
  renderPreviews,
  writePreviews,
} from './preview-notifications.js';

describe('renderPreviews (11.4 preview script)', () => {
  const files = renderPreviews();

  it('renders every template as HTML and plain text, plus an index', () => {
    const templates = Object.keys(NOTIFICATION_TEMPLATES);

    expect(files).toHaveLength(templates.length * 2 + 1);
    for (const template of templates) {
      expect(files.map((file) => file.name)).toEqual(
        expect.arrayContaining([`${template}.html`, `${template}.txt`]),
      );
    }
  });

  it('opens each HTML preview as a page that shows its subject', () => {
    const html = files.find((file) => file.name === 'content_scheduled.html')!;

    expect(html.content.startsWith('<!doctype html>')).toBe(true);
    expect(html.content).toContain('<title>Konten baru: Promo Lebaran</title>');
    expect(html.content).toContain(`${PREVIEW_APP_URL}/creator/tasks?content=`);
  });

  it('starts each text preview with its subject line', () => {
    const text = files.find((file) => file.name === 'content_scheduled.txt')!;

    expect(
      text.content.startsWith('Subjek: Konten baru: Promo Lebaran\n'),
    ).toBe(true);
  });

  it('notes an attachment in the preview instead of embedding it', () => {
    const text = files.find((file) => file.name === 'invoice_paid.txt')!;

    expect(text.content).toMatch(/^Lampiran: Invoice_.+\.pdf \(\d+ byte\)$/m);
  });

  it('lists every template in the index with links to both versions', () => {
    const index = files.find((file) => file.name === 'index.html')!;

    expect(index.content).toContain('<a href="invoice_paid.html">');
    expect(index.content).toContain('<a href="invoice_paid.txt">');
    expect(index.content.match(/<li>/g)).toHaveLength(
      Object.keys(NOTIFICATION_TEMPLATES).length,
    );
  });
});

describe('writePreviews', () => {
  it('writes every file into the folder given and answers with the index path', async () => {
    const written: string[] = [];
    const made: string[] = [];

    const index = await writePreviews('out/previews', {
      mkdir: async (dir) => {
        made.push(dir);
      },
      writeFile: async (path) => {
        written.push(path.replaceAll('\\', '/'));
      },
    });

    expect(made).toEqual(['out/previews']);
    expect(written).toContain('out/previews/index.html');
    expect(written).toContain('out/previews/invoice_paid.txt');
    expect(written).toHaveLength(renderPreviews().length);
    expect(index.replaceAll('\\', '/')).toBe('out/previews/index.html');
  });
});
