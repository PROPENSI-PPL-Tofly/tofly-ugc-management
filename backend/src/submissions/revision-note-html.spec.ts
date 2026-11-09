import {
  MAX_NOTE_TEXT_LENGTH,
  revisionNoteLength,
  revisionNoteText,
  sanitizeRevisionNote,
} from './revision-note-html.js';

describe('sanitizeRevisionNote', () => {
  it('keeps the formatting the toolbar can make: bold, italic, lists, links and line breaks', () => {
    const html =
      '<p>Tolong <strong>potong</strong> <em>intro</em></p><ul><li>Audio</li><li>Warna</li></ul><ol><li>Urut</li></ol><br><a href="https://example.com/referensi">referensi</a>';

    expect(sanitizeRevisionNote(html)).toBe(
      '<p>Tolong <strong>potong</strong> <em>intro</em></p><ul><li>Audio</li><li>Warna</li></ul><ol><li>Urut</li></ol><br /><a href="https://example.com/referensi" rel="noopener noreferrer nofollow">referensi</a>',
    );
  });

  it('drops a script tag and the code inside it, so nothing runs in the creator browser (AC 7)', () => {
    expect(
      sanitizeRevisionNote(
        '<p>Aman</p><script>alert(document.cookie)</script><p>Tetap ada</p>',
      ),
    ).toBe('<p>Aman</p><p>Tetap ada</p>');
  });

  it('drops tags outside the allowlist but keeps their words (AC 7)', () => {
    expect(
      sanitizeRevisionNote(
        '<iframe src="https://evil.example"></iframe><span>Potong di <b>menit 30</b></span>',
      ),
    ).toBe('Potong di menit 30');
  });

  it('drops every attribute the allowlist does not name, event handlers included (AC 7)', () => {
    expect(
      sanitizeRevisionNote(
        '<p onmouseover="steal()" style="position:fixed" class="x">Hati-hati</p>',
      ),
    ).toBe('<p>Hati-hati</p>');
  });

  it('keeps a link the allowlist allows and one it does not', () => {
    const kept = sanitizeRevisionNote(
      '<a href="https://example.com/aman">aman</a>',
    );
    const dropped = sanitizeRevisionNote(
      '<a href="javascript:steal()">jangan</a>',
    );

    expect(kept).toContain('href="https://example.com/aman"');
    expect(kept).toContain('rel="noopener noreferrer nofollow"');
    expect(dropped).not.toContain('javascript');
  });
});

describe('revisionNoteText', () => {
  it('reads the words without any formatting', () => {
    expect(
      revisionNoteText('<p>Tolong <strong>potong</strong> intro</p>'),
    ).toBe('Tolong potong intro');
  });

  it('keeps the breaks between paragraphs, list items and lines as line breaks', () => {
    expect(revisionNoteText('<p>Satu</p><p>Dua</p>')).toBe('Satu\nDua');
    expect(revisionNoteText('<ul><li>Satu</li><li>Dua</li></ul>')).toBe(
      'Satu\nDua',
    );
    expect(revisionNoteText('Satu<br>Dua<br/>Tiga')).toBe('Satu\nDua\nTiga');
  });

  // Review on #188: the line breaks between blocks are not counted, so 990/1000 in the editor
  // (34.2) is never refused here. The editor counts a Shift+Enter line as one; here it counts as
  // none, the safe way round.
  it('counts the characters, not the line breaks between them', () => {
    expect(revisionNoteLength('<p>ab</p><p>cd</p>')).toBe(4);
    expect(revisionNoteLength('Satu<br>Dua')).toBe(7);
  });

  it('counts a note with a list as the editor does', () => {
    // The HTML exactly as the editor sends it, the empty paragraph after a list included.
    expect(
      revisionNoteLength(
        '<p>Tolong ganti:</p><ul><li><p>audio</p></li><li><p>caption</p></li></ul><p></p>',
      ),
    ).toBe(25);
  });

  it('counts an emoji as one character, not two (Unicode characters, not UTF-16 units)', () => {
    expect(revisionNoteLength('😀😀')).toBe(2);
    expect(revisionNoteLength('<strong>😀</strong>')).toBe(1);
  });

  it('counts an entity as the character it stands for', () => {
    expect(revisionNoteLength('A &amp; B')).toBe(5);
    expect(revisionNoteText('A &amp; B')).toBe('A & B');
  });

  it('names the room the note gets', () => {
    expect(MAX_NOTE_TEXT_LENGTH).toBe(1000);
  });
});
