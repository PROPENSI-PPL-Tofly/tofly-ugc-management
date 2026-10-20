import { UnprocessableEntityException } from '@nestjs/common';
import {
  checkPaymentProof,
  PROOF_MAX_BYTES,
  proofFileName,
  type UploadedProof,
} from './payment-proof-file.js';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00]);

const INVALID = {
  code: 'PROOF_INVALID',
  message: 'File bukti pembayaran harus PDF, JPG, atau PNG.',
};

function upload(buffer: Buffer, originalname = 'bukti.png'): UploadedProof {
  // The browser's claim, which the check must not trust.
  return { buffer, originalname, mimetype: 'image/png' };
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
  it.each([
    [PDF, 'bukti.pdf', 'application/pdf'],
    [PNG, 'bukti.png', 'image/png'],
    [JPEG, 'bukti.jpg', 'image/jpeg'],
  ])(
    'names the type from the bytes, not from what the browser declared (%#)',
    (bytes, name, type) => {
      expect(checkPaymentProof(upload(bytes, name))).toEqual({
        bytes,
        contentType: type,
        fileName: name,
      });
    },
  );

  // OWASP Top 10:2025 A06 (Insecure Design): a renamed file must not pass as a proof.
  it('refuses a program renamed .png and declared image/png', () => {
    expect(
      refusalOf(() => checkPaymentProof(upload(Buffer.from('MZ\x90\x00')))),
    ).toEqual(INVALID);
  });

  it('refuses a form with no file', () => {
    expect(refusalOf(() => checkPaymentProof(undefined))).toEqual(INVALID);
  });

  it('refuses one byte over 5 MB and takes exactly 5 MB (off by one)', () => {
    expect(
      refusalOf(() =>
        checkPaymentProof(upload(sized(PNG, PROOF_MAX_BYTES + 1))),
      ),
    ).toEqual({
      code: 'PROOF_TOO_LARGE',
      message: 'Ukuran file maksimal 5 MB.',
    });
    expect(
      checkPaymentProof(upload(sized(PNG, PROOF_MAX_BYTES))).bytes,
    ).toHaveLength(PROOF_MAX_BYTES);
  });

  it('refuses a file cut off inside a signature, or an empty one', () => {
    expect(
      refusalOf(() => checkPaymentProof(upload(PNG.subarray(0, 7)))),
    ).toEqual(INVALID);
    expect(refusalOf(() => checkPaymentProof(upload(Buffer.alloc(0))))).toEqual(
      INVALID,
    );
  });
});

describe('proofFileName', () => {
  it('keeps a plain name, and a JPEG extension in any case', () => {
    expect(proofFileName('Transfer Agustus ✅.pdf', 'application/pdf')).toBe(
      'Transfer Agustus ✅.pdf',
    );
    expect(proofFileName('bukti.JPEG', 'image/jpeg')).toBe('bukti.JPEG');
  });

  // OWASP Top 10:2025 A05 (Injection): the name is shown and sent in a header, so it must not
  // carry a path, a header break or text that runs the other way.
  it.each([
    ['../../etc/passwd.pdf', 'passwd.pdf'],
    ['C:\\Users\\admin\\bukti.pdf', 'bukti.pdf'],
    ['bukti\r\n\u0000\u202e.pdf', 'bukti.pdf'],
    ['bukti "asli".pdf', "bukti 'asli'.pdf"],
  ])('cleans %j to %j', (name, shown) => {
    expect(proofFileName(name, 'application/pdf')).toBe(shown);
  });

  it('adds the extension the bytes prove when the name says otherwise', () => {
    expect(proofFileName('bukti.exe', 'image/png')).toBe('bukti.exe.png');
  });

  it('names a file left with nothing to show bukti-pembayaran', () => {
    expect(proofFileName('', 'application/pdf')).toBe('bukti-pembayaran.pdf');
    expect(proofFileName('.pdf', 'application/pdf')).toBe(
      'bukti-pembayaran.pdf',
    );
  });

  // varchar(255) counts characters: the cut keeps the extension and never splits an emoji.
  it('cuts a long name to 255 characters, keeping its extension', () => {
    const name = proofFileName(`${'😀'.repeat(300)}.png`, 'image/png');

    expect(Array.from(name)).toHaveLength(255);
    expect(name).toMatch(/^(😀)+\.png$/u);
  });
});
