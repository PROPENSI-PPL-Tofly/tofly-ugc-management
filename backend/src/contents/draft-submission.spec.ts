import { UnprocessableEntityException } from '@nestjs/common';
import {
  checkDraftSubmission,
  MAX_DRAFT_LINK_LENGTH,
  MAX_DRAFT_NOTES_LENGTH,
  nextDraftStatus,
} from './draft-submission.js';

function rejection(input: unknown): unknown {
  try {
    checkDraftSubmission(input);
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    return (error as UnprocessableEntityException).getResponse();
  }
  throw new Error('expected checkDraftSubmission to reject');
}

const LINK = 'https://drive.google.com/file/d/abc123/view';

describe('checkDraftSubmission', () => {
  describe('link', () => {
    it.each([
      ['no body', null],
      ['a body that is not an object', 'https://drive.google.com'],
      ['a list', [LINK]],
      ['no link', {}],
      ['a link that is not text', { link: 42 }],
      ['an empty link', { link: '' }],
      ['a blank link', { link: '   ' }],
    ])('asks for the link when given %s', (_case, input) => {
      expect(rejection(input)).toEqual({
        message: 'Data draft tidak valid',
        errors: { link: 'Link draft wajib diisi' },
      });
    });

    it.each([
      ['text that is not a URL', 'draft saya'],
      ['a path with no scheme', 'drive.google.com/file/d/abc'],
      ['a javascript: URL (OWASP A03)', 'javascript:alert(document.cookie)'],
      ['a data: URL (OWASP A03)', 'data:text/html,<script>alert(1)</script>'],
      ['an ftp: URL', 'ftp://files.example.com/draft.mp4'],
    ])('refuses %s', (_case, link) => {
      expect(rejection({ link })).toEqual({
        message: 'Data draft tidak valid',
        errors: { link: 'Link draft harus berupa URL http atau https' },
      });
    });

    it('refuses a link longer than the cap', () => {
      const link = `https://x.com/${'a'.repeat(MAX_DRAFT_LINK_LENGTH)}`;

      expect(rejection({ link })).toEqual({
        message: 'Data draft tidak valid',
        errors: {
          link: `Link draft maksimal ${MAX_DRAFT_LINK_LENGTH} karakter`,
        },
      });
    });

    it('accepts a link exactly at the cap', () => {
      const prefix = 'https://x.com/';
      const link = prefix + 'a'.repeat(MAX_DRAFT_LINK_LENGTH - prefix.length);

      expect(checkDraftSubmission({ link }).link).toBe(link);
    });

    it('accepts http and https links, trimmed', () => {
      expect(checkDraftSubmission({ link: `  ${LINK}  ` })).toEqual({
        link: LINK,
        notes: null,
      });
      expect(checkDraftSubmission({ link: 'http://example.com/d' }).link).toBe(
        'http://example.com/d',
      );
    });
  });

  describe('notes', () => {
    it.each([
      ['left out', {}],
      ['null', { notes: null }],
      ['empty', { notes: '' }],
      ['blank', { notes: '  \n ' }],
    ])('stores no note when it is %s', (_case, extra) => {
      expect(checkDraftSubmission({ link: LINK, ...extra }).notes).toBeNull();
    });

    it('keeps a note, trimmed', () => {
      expect(
        checkDraftSubmission({
          link: LINK,
          notes: '  Sudah pakai musik baru.  ',
        }).notes,
      ).toBe('Sudah pakai musik baru.');
    });

    it('refuses a note that is not text', () => {
      expect(rejection({ link: LINK, notes: 7 })).toEqual({
        message: 'Data draft tidak valid',
        errors: { notes: 'Catatan harus berupa teks' },
      });
    });

    it('refuses a note longer than the cap, and accepts one at it', () => {
      expect(
        rejection({
          link: LINK,
          notes: 'a'.repeat(MAX_DRAFT_NOTES_LENGTH + 1),
        }),
      ).toEqual({
        message: 'Data draft tidak valid',
        errors: {
          notes: `Catatan maksimal ${MAX_DRAFT_NOTES_LENGTH} karakter`,
        },
      });
      expect(
        checkDraftSubmission({
          link: LINK,
          notes: 'a'.repeat(MAX_DRAFT_NOTES_LENGTH),
        }).notes,
      ).toHaveLength(MAX_DRAFT_NOTES_LENGTH);
    });
  });

  it('reports a bad link and a bad note together', () => {
    expect(rejection({ link: 'bukan link', notes: false })).toEqual({
      message: 'Data draft tidak valid',
      errors: {
        link: 'Link draft harus berupa URL http atau https',
        notes: 'Catatan harus berupa teks',
      },
    });
  });
});

describe('nextDraftStatus', () => {
  it('sends a first draft to review', () => {
    expect(nextDraftStatus('scheduled')).toBe('draft_review');
  });

  it('marks a draft handed in after a revision request as revised, so the queue puts it first', () => {
    expect(nextDraftStatus('draft_revision')).toBe('draft_revised');
  });

  it.each([
    'draft_review',
    'draft_revised',
    'draft_approved',
    'link_submitted',
  ] as const)('has no next step from %s', (status) => {
    expect(nextDraftStatus(status)).toBeNull();
  });
});
