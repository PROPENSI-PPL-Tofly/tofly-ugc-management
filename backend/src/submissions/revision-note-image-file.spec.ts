import {
  checkRevisionNoteImage,
  imageLimitReached,
  imageTooLarge,
  imageTypeRefused,
  IMAGE_MAX_BYTES,
  MAX_NOTE_IMAGES,
  noteImageFileName,
} from './revision-note-image-file.js';

const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_HEAD = Buffer.alloc(12);
Buffer.from('RIFF').copy(WEBP_HEAD, 0);
Buffer.from('WEBP').copy(WEBP_HEAD, 8);

/** A buffer of exactly `size` bytes that starts with `head`. */
function sized(head: Buffer, size: number): Buffer {
  const bytes = Buffer.alloc(size);
  head.copy(bytes);
  return bytes;
}

function file(head: Buffer, name = 'bukti.jpg', mimetype = 'image/jpeg') {
  return { buffer: sized(head, 64), originalname: name, mimetype };
}

describe('checkRevisionNoteImage', () => {
  it('takes a JPG, a PNG or a WebP by its bytes, whatever the file claims to be (AC 3)', () => {
    expect(
      checkRevisionNoteImage(file(JPEG_HEAD, 'gambar.jpg')).contentType,
    ).toBe('image/jpeg');
    expect(
      checkRevisionNoteImage(file(PNG_HEAD, 'gambar.png')).contentType,
    ).toBe('image/png');
    expect(
      checkRevisionNoteImage(file(WEBP_HEAD, 'gambar.webp')).contentType,
    ).toBe('image/webp');
  });

  it('reads a WebP by its RIFF and WEBP marks, not by its name (AC 3)', () => {
    const riffOnly = sized(Buffer.from('RIFF'), 64);
    Buffer.from('WAVE').copy(riffOnly, 8);

    expect(() =>
      checkRevisionNoteImage(file(riffOnly, 'gambar.webp')),
    ).toThrow(
      expect.objectContaining({
        status: 422,
        response: {
          code: 'IMAGE_TYPE',
          message: 'Format harus JPG, PNG, atau WebP',
        },
      }),
    );
  });

  it.each([
    ['a PDF', Buffer.from('%PDF-1.7\n'), 'dokumen.pdf', 'application/pdf'],
    ['a GIF', Buffer.from('GIF89a'), 'animasi.gif', 'image/gif'],
    ['plain text', Buffer.from('halo'), 'catatan.txt', 'text/plain'],
    ['no bytes at all', Buffer.alloc(0), 'kosong.png', 'image/png'],
  ])(
    'refuses %s with its own reason (AC 4)',
    (_label, buffer, originalname, mimetype) => {
      expect(() =>
        checkRevisionNoteImage({ buffer, originalname, mimetype }),
      ).toThrow(
        expect.objectContaining({
          status: 422,
          response: {
            code: 'IMAGE_TYPE',
            message: 'Format harus JPG, PNG, atau WebP',
          },
        }),
      );
    },
  );

  it('refuses a request that carries no file at all with the same reason (AC 4)', () => {
    expect(() => checkRevisionNoteImage(undefined)).toThrow(
      expect.objectContaining({
        status: 422,
        response: {
          code: 'IMAGE_TYPE',
          message: 'Format harus JPG, PNG, atau WebP',
        },
      }),
    );
  });

  it('refuses a file over 5 MB with its own reason (AC 4)', () => {
    const tooBig = sized(JPEG_HEAD, IMAGE_MAX_BYTES + 1);

    expect(() =>
      checkRevisionNoteImage({
        buffer: tooBig,
        originalname: 'besar.jpg',
        mimetype: 'image/jpeg',
      }),
    ).toThrow(
      expect.objectContaining({
        status: 422,
        response: {
          code: 'IMAGE_TOO_LARGE',
          message: 'Ukuran maksimal 5 MB',
        },
      }),
    );
  });

  it('takes a file of exactly 5 MB (AC 4)', () => {
    const biggest = sized(JPEG_HEAD, IMAGE_MAX_BYTES);

    expect(
      checkRevisionNoteImage({
        buffer: biggest,
        originalname: 'besar.jpg',
        mimetype: 'image/jpeg',
      }).bytes.length,
    ).toBe(IMAGE_MAX_BYTES);
  });

  it('refuses a file over 5 MB for its size whatever it is, before its type', () => {
    const tooBigText = Buffer.alloc(IMAGE_MAX_BYTES + 1, 0x41);

    expect(() =>
      checkRevisionNoteImage({
        buffer: tooBigText,
        originalname: 'besar.txt',
        mimetype: 'text/plain',
      }),
    ).toThrow(
      expect.objectContaining({
        response: {
          code: 'IMAGE_TOO_LARGE',
          message: 'Ukuran maksimal 5 MB',
        },
      }),
    );
  });

  it('names the limit for a note (AC 4)', () => {
    expect(MAX_NOTE_IMAGES).toBe(5);
    expect(imageLimitReached()).toMatchObject({
      status: 422,
      response: {
        code: 'IMAGE_LIMIT',
        message: 'Maksimal 5 gambar per catatan',
      },
    });
    expect(imageTooLarge().getResponse()).toEqual({
      code: 'IMAGE_TOO_LARGE',
      message: 'Ukuran maksimal 5 MB',
    });
    expect(imageTypeRefused().getResponse()).toEqual({
      code: 'IMAGE_TYPE',
      message: 'Format harus JPG, PNG, atau WebP',
    });
  });
});

describe('noteImageFileName', () => {
  it('keeps a name of the type it is shown as', () => {
    expect(noteImageFileName('layar sentuh.png', 'image/png')).toBe(
      'layar sentuh.png',
    );
  });

  it('gives a name whose extension disagrees with its bytes the extension its bytes prove', () => {
    expect(noteImageFileName('gambar.jpg', 'image/png')).toBe('gambar.png');
    expect(noteImageFileName('gambar', 'image/webp')).toBe('gambar.webp');
  });

  it('takes no folders and no characters a name may only show with', () => {
    expect(
      noteImageFileName('C:\\Users\\joki\\../"rahasia"\u202Egpj.exe', 'image/jpeg'),
    ).toBe("'rahasia'gpj.jpg");
  });

  it('falls back to a name of its own when nothing showable is left', () => {
    expect(noteImageFileName('\u202E\u202E', 'image/png')).toBe(
      'gambar-revisi.png',
    );
  });
});
