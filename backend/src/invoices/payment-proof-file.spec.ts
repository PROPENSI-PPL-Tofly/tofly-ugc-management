import { UnprocessableEntityException } from '@nestjs/common';
import {
  checkPaymentProof,
  PROOF_MAX_BYTES,
  proofFileName,
  type UploadedProof,
} from './payment-proof-file.js';

const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n', 'latin1');
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG_JFIF = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]);
const JPEG_EXIF = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45]);

const INVALID = {
  code: 'PROOF_INVALID',
  message: 'File bukti pembayaran harus PDF, JPG, atau PNG.',
};
const TOO_LARGE = {
  code: 'PROOF_TOO_LARGE',
  message: 'Ukuran file maksimal 5 MB.',
};

function upload(
  buffer: Buffer,
  originalname = 'bukti.pdf',
  mimetype = 'application/pdf',
): UploadedProof {
  return { buffer, originalname, mimetype };
}

/** A buffer of exactly `size` bytes that starts with `head`. */
function sized(head: Buffer, size: number): Buffer {
  const bytes = Buffer.alloc(size);
  head.copy(bytes);
  return bytes;
}

function refusalOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    return (error as UnprocessableEntityException).getResponse();
  }
  return expect.unreachable('the file must be refused');
}

describe('checkPaymentProof', () => {
  describe('accepts', () => {
    it.each([
      ['a PDF', PDF, 'transfer.pdf', 'application/pdf'],
      ['a PNG', PNG, 'transfer.png', 'image/png'],
      ['a JFIF JPEG', JPEG_JFIF, 'transfer.jpg', 'image/jpeg'],
      ['an EXIF JPEG', JPEG_EXIF, 'transfer.jpeg', 'image/jpeg'],
    ])('%s, naming its type from its bytes', (_case, bytes, name, type) => {
      expect(checkPaymentProof(upload(bytes, name, 'whatever/else'))).toEqual({
        bytes,
        contentType: type,
        fileName: name,
      });
    });
  });

  // OWASP Top 10:2025 A06 (Insecure Design): the browser's declared type and the file's name are
  // the uploader's claims; only the bytes decide what the file is.
  describe('refuses', () => {
    it('an upload with no file', () => {
      expect(refusalOf(() => checkPaymentProof(undefined))).toEqual(INVALID);
    });

    it('an empty file', () => {
      expect(
        refusalOf(() => checkPaymentProof(upload(Buffer.alloc(0)))),
      ).toEqual(INVALID);
    });

    it.each([
      ['a Windows program', Buffer.from('MZ\x90\x00\x03', 'latin1')],
      ['a ZIP archive', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14])],
      ['a GIF', Buffer.from('GIF89a\x01\x00', 'latin1')],
      ['a WebP', Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1')],
      ['an SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')],
      ['an HTML page', Buffer.from('<!doctype html><script>alert(1)</script>')],
    ])('%s renamed .png and declared image/png', (_case, bytes) => {
      expect(
        refusalOf(() =>
          checkPaymentProof(upload(bytes, 'bukti.png', 'image/png')),
        ),
      ).toEqual(INVALID);
    });

    it('a file one byte over 5 MB, before reading its type', () => {
      expect(
        refusalOf(() =>
          checkPaymentProof(upload(sized(PDF, PROOF_MAX_BYTES + 1))),
        ),
      ).toEqual(TOO_LARGE);
    });

    it('an oversized file that is not a proof type as too large, the first rule it breaks', () => {
      expect(
        refusalOf(() =>
          checkPaymentProof(upload(Buffer.alloc(PROOF_MAX_BYTES + 1))),
        ),
      ).toEqual(TOO_LARGE);
    });
  });

  describe('edge:', () => {
    it('takes a file of exactly 5 MB', () => {
      const bytes = sized(PNG, PROOF_MAX_BYTES);

      expect(checkPaymentProof(upload(bytes, 'besar.png')).bytes).toHaveLength(
        5_242_880,
      );
    });

    it.each([
      ['one byte', Buffer.from([0xff])],
      ['two bytes', Buffer.from([0xff, 0xd8])],
      ['three bytes of a PNG', Buffer.from([0x89, 0x50, 0x4e])],
      ['seven bytes of a PNG', PNG.subarray(0, 7)],
      ['four bytes of a PDF', Buffer.from('%PDF')],
    ])('refuses %s, shorter than any whole signature', (_case, bytes) => {
      expect(refusalOf(() => checkPaymentProof(upload(bytes)))).toEqual(
        INVALID,
      );
    });

    it('refuses %PDF without the dash that completes the signature', () => {
      expect(
        refusalOf(() => checkPaymentProof(upload(Buffer.from('%PDF1.7\n')))),
      ).toEqual(INVALID);
    });

    it('refuses a signature that only appears after the first byte', () => {
      expect(
        refusalOf(() => checkPaymentProof(upload(Buffer.from(' %PDF-1.7')))),
      ).toEqual(INVALID);
    });
  });
});

describe('proofFileName', () => {
  describe('accepts', () => {
    it('keeps a plain name as typed', () => {
      expect(proofFileName('transfer-agustus.pdf', 'application/pdf')).toBe(
        'transfer-agustus.pdf',
      );
    });

    it.each(['bukti.JPG', 'bukti.jpeg', 'bukti.Jpeg'])(
      'keeps %s, an extension the JPEG type answers to',
      (name) => {
        expect(proofFileName(name, 'image/jpeg')).toBe(name);
      },
    );

    it('keeps Indonesian words, spaces and emoji', () => {
      expect(proofFileName('Bukti transfer Agustus ✅.png', 'image/png')).toBe(
        'Bukti transfer Agustus ✅.png',
      );
    });
  });

  // OWASP Top 10:2025 A05 (Injection): a name is only ever shown, but what is shown must not be
  // able to pass as a path, a header break or text running the other way.
  describe('refuses', () => {
    it.each([
      ['../../etc/passwd.pdf', 'passwd.pdf'],
      ['C:\\Users\\admin\\bukti.pdf', 'bukti.pdf'],
      ['/var/tmp/../bukti.pdf', 'bukti.pdf'],
    ])('the folders in %s, keeping the last part', (name, kept) => {
      expect(proofFileName(name, 'application/pdf')).toBe(kept);
    });

    it.each([
      ['a NUL', 'bukti\u0000.pdf'],
      ['a line break', 'bukti\r\n.pdf'],
      ['a tab', 'bukti\t.pdf'],
      ['a right-to-left override', 'bukti\u202e.pdf'],
      ['a zero-width space', 'bu\u200bkti.pdf'],
      ['a delete character', 'bukti\u007f.pdf'],
    ])('%s inside the name', (_case, name) => {
      expect(proofFileName(name, 'application/pdf')).toBe('bukti.pdf');
    });

    it('a double quote, which would end a quoted header value', () => {
      expect(proofFileName('bukti "asli".pdf', 'application/pdf')).toBe(
        "bukti 'asli'.pdf",
      );
    });

    it('an extension that disagrees with the bytes, adding the right one', () => {
      expect(proofFileName('bukti.exe', 'image/png')).toBe('bukti.exe.png');
    });

    it('a name with no extension, adding the one its bytes name', () => {
      expect(proofFileName('bukti', 'application/pdf')).toBe('bukti.pdf');
    });

    it('a name that is only the extension word, keeping it whole as the name', () => {
      expect(proofFileName('pdf', 'application/pdf')).toBe('pdf.pdf');
    });
  });

  describe('edge:', () => {
    it.each(['', '   ', '\u0000\u202e', '../', '.pdf'])(
      'names a file whose name is left empty (%j) bukti-pembayaran',
      (name) => {
        expect(proofFileName(name, 'application/pdf')).toBe(
          'bukti-pembayaran.pdf',
        );
      },
    );

    it('cuts a 300-character name to 255, keeping its extension', () => {
      const name = proofFileName(`${'a'.repeat(296)}.pdf`, 'application/pdf');

      expect(name).toHaveLength(255);
      expect(name.endsWith('a.pdf')).toBe(true);
    });

    // Postgres counts varchar(255) in characters, and an emoji outside the BMP is two UTF-16
    // units: the cut counts characters too, so it neither overflows the column nor splits one.
    it('cuts a long name between characters, never inside an emoji', () => {
      const name = proofFileName(`${'😀'.repeat(300)}.png`, 'image/png');

      expect(Array.from(name)).toHaveLength(255);
      expect(name).toMatch(/^(😀)+\.png$/u);
    });

    it('keeps a name of exactly 255 characters as it is', () => {
      const exact = `${'b'.repeat(251)}.pdf`;

      expect(proofFileName(exact, 'application/pdf')).toBe(exact);
    });

    it('squeezes runs of spaces and trims the ends', () => {
      expect(
        proofFileName('  bukti    transfer .pdf  ', 'application/pdf'),
      ).toBe('bukti transfer .pdf');
    });
  });
});
