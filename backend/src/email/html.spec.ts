import { escapeHtml } from './html.js';

describe('escapeHtml', () => {
  it('escapes the five characters that would become markup', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });

  it('leaves plain words, emoji and Indonesian text as they are', () => {
    expect(escapeHtml('Konten Lebaran 🎉 untuk UMKM')).toBe(
      'Konten Lebaran 🎉 untuk UMKM',
    );
  });
});
