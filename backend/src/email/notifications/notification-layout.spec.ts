import {
  MAX_LINES,
  MAX_SUBJECT_LENGTH,
  NOTIFICATION_FOOTER,
  fitSubject,
  renderNotification,
} from './notification-layout.js';

const APP = 'https://tofly.example';

const PARTS = {
  greetingName: 'Rangga',
  lines: ['Admin menjadwalkan konten Promo.', 'Deadline: 30 Nov 2026.'],
  button: { label: 'Lihat Konten', path: '/creator/tasks?content=abc' },
};

describe('renderNotification (AC 7)', () => {
  it('writes the plain text as greeting, lines, button link and footer', () => {
    expect(renderNotification(PARTS, APP).text).toBe(
      [
        'Halo Rangga,',
        '',
        'Admin menjadwalkan konten Promo.',
        'Deadline: 30 Nov 2026.',
        '',
        'Lihat Konten: https://tofly.example/creator/tasks?content=abc',
        '',
        '--',
        'Email otomatis dari Tofly. Jangan balas email ini.',
      ].join('\n'),
    );
  });

  it('draws the same words in the HTML, with one button to the exact page', () => {
    const { html } = renderNotification(PARTS, APP);

    expect(html).toContain('Halo Rangga,');
    expect(html).toContain('Admin menjadwalkan konten Promo.');
    expect(html).toContain('Deadline: 30 Nov 2026.');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain(
      'href="https://tofly.example/creator/tasks?content=abc"',
    );
    expect(html).toContain('>Lihat Konten</a>');
    expect(html).toContain(NOTIFICATION_FOOTER);
  });

  it('greets without a name when the recipient has none', () => {
    const rendered = renderNotification({ ...PARTS, greetingName: null }, APP);

    expect(rendered.text.startsWith('Halo,\n')).toBe(true);
    expect(rendered.html).toContain('Halo,');
  });

  it('treats a blank name as no name', () => {
    expect(
      renderNotification({ ...PARTS, greetingName: '   ' }, APP).text,
    ).toMatch(/^Halo,\n/);
  });

  // An Admin has no name yet, so the helper hands their address in its place (11.2).
  it('greets without a name when it is given an email address instead', () => {
    expect(
      renderNotification({ ...PARTS, greetingName: 'dewi@tofly.id' }, APP).text,
    ).toMatch(/^Halo,\n/);
  });

  it('joins the app address and the path with exactly one slash', () => {
    expect(renderNotification(PARTS, `${APP}/`).text).toContain(
      'Lihat Konten: https://tofly.example/creator/tasks?content=abc',
    );
  });

  it('escapes every word it puts into the HTML, the address included', () => {
    const { html, text } = renderNotification(
      {
        greetingName: '<b>Rangga</b>',
        lines: ['Konten "Tom & Jerry"'],
        button: { label: 'Buka <x>', path: '/creator/tasks?a=1&b=2' },
      },
      APP,
    );

    expect(html).toContain('Halo &lt;b&gt;Rangga&lt;/b&gt;,');
    expect(html).toContain('Konten &quot;Tom &amp; Jerry&quot;');
    expect(html).toContain(
      'href="https://tofly.example/creator/tasks?a=1&amp;b=2"',
    );
    expect(html).toContain('>Buka &lt;x&gt;</a>');
    expect(html).not.toContain('<b>Rangga</b>');
    expect(text).toContain('Halo <b>Rangga</b>,');
  });

  it(`refuses more than ${MAX_LINES} lines, so no template can grow past the rule`, () => {
    expect(() =>
      renderNotification({ ...PARTS, lines: ['1', '2', '3', '4'] }, APP),
    ).toThrow('A notification holds at most 3 lines');
  });

  it('refuses a button path that is not on the app, so no email links away', () => {
    expect(() =>
      renderNotification(
        { ...PARTS, button: { label: 'x', path: 'https://evil.example' } },
        APP,
      ),
    ).toThrow('A notification button opens a page of the app');
    expect(() =>
      renderNotification(
        { ...PARTS, button: { label: 'x', path: '//evil.example' } },
        APP,
      ),
    ).toThrow('A notification button opens a page of the app');
  });
});

describe('fitSubject (AC 7)', () => {
  it('keeps a subject that fits as it is', () => {
    expect(fitSubject('Konten baru: ', 'Promo Lebaran')).toBe(
      'Konten baru: Promo Lebaran',
    );
  });

  it(`cuts a long name with an ellipsis so the subject is exactly ${MAX_SUBJECT_LENGTH} characters`, () => {
    const subject = fitSubject('Konten baru: ', 'x'.repeat(100));

    expect(subject).toHaveLength(MAX_SUBJECT_LENGTH);
    expect(subject.startsWith('Konten baru: xxx')).toBe(true);
    expect(subject.endsWith('…')).toBe(true);
  });

  it('keeps a name that fits exactly, with no ellipsis', () => {
    const prefix = 'Konten baru: ';
    const name = 'y'.repeat(MAX_SUBJECT_LENGTH - prefix.length);

    expect(fitSubject(prefix, name)).toBe(`${prefix}${name}`);
  });

  it('counts an emoji as one character, never cutting it in half', () => {
    const subject = fitSubject('Konten baru: ', '🎉'.repeat(80));

    expect([...subject]).toHaveLength(MAX_SUBJECT_LENGTH);
    expect(subject).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('collapses runs of spaces and trims the name', () => {
    expect(fitSubject('Konten baru: ', '  Promo   Lebaran  ')).toBe(
      'Konten baru: Promo Lebaran',
    );
  });
});
