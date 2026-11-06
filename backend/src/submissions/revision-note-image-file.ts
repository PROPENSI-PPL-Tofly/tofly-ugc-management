import { UnprocessableEntityException } from '@nestjs/common';

// What a revision note's screenshot may be (PBI-34, 34.1). The browser's declared type and the
// file's name are the uploader's claims; only the bytes decide what the file is (AC 3), and
// each way an upload is refused has its own reason, worded as the AC words it (AC 4).

/** The largest screenshot taken: 5 MB (AC 4). */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** How many screenshots one note may carry (AC 4). */
export const MAX_NOTE_IMAGES = 5;

export type NoteImageContentType = 'image/jpeg' | 'image/png' | 'image/webp';

/** The part of a multer file the check reads. */
export interface UploadedNoteImage {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

/** The file as stored: its bytes, the type they prove, and a name safe to show. */
export interface CheckedNoteImage {
  bytes: Buffer;
  contentType: NoteImageContentType;
  fileName: string;
}

/** What each type's files start with; a WebP is a RIFF file whose form is WEBP. */
const SIGNATURES: readonly {
  type: NoteImageContentType;
  at: number;
  signature: readonly number[];
}[] = [
  { type: 'image/jpeg', at: 0, signature: [0xff, 0xd8, 0xff] },
  {
    type: 'image/png',
    at: 0,
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  {
    type: 'image/webp',
    at: 0,
    signature: [0x52, 0x49, 0x46, 0x46],
  },
  {
    type: 'image/webp',
    at: 8,
    signature: [0x57, 0x45, 0x42, 0x50],
  },
];

/** The extensions a name of each type may carry; the first is added when it carries none. */
const EXTENSIONS: Record<NoteImageContentType, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

const MAX_NAME_LENGTH = 255;
const FALLBACK_NAME = 'gambar-revisi';

export function imageTypeRefused(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'IMAGE_TYPE',
    message: 'Format harus JPG, PNG, atau WebP',
  });
}

export function imageTooLarge(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'IMAGE_TOO_LARGE',
    message: 'Ukuran maksimal 5 MB',
  });
}

export function imageLimitReached(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'IMAGE_LIMIT',
    message: 'Maksimal 5 gambar per catatan',
  });
}

function typeOf(bytes: Buffer): NoteImageContentType | undefined {
  // A WebP carries both marks: the RIFF container and the WEBP form name at byte 8.
  const webp = SIGNATURES.filter(({ type }) => type === 'image/webp');
  if (
    webp.every(({ at, signature }) =>
      signature.every((byte, index) => bytes.at(at + index) === byte),
    )
  ) {
    return 'image/webp';
  }
  return SIGNATURES.filter(({ type }) => type !== 'image/webp').find(
    ({ at, signature }) =>
      signature.every((byte, index) => bytes.at(at + index) === byte),
  )?.type;
}

/** The file as stored: its bytes, the type they prove, and a name safe to show. */
export function checkRevisionNoteImage(
  file: UploadedNoteImage | undefined,
): CheckedNoteImage {
  if (!file || file.buffer.length === 0) throw imageTypeRefused();
  // Size first: an oversized file is refused for its size whatever it is (AC 4).
  if (file.buffer.length > IMAGE_MAX_BYTES) throw imageTooLarge();

  const type = typeOf(file.buffer);
  if (!type) throw imageTypeRefused();

  return {
    bytes: file.buffer,
    contentType: type,
    fileName: noteImageFileName(file.originalname, type),
  };
}

/**
 * The uploader's file name made safe to show: no folders, no control or formatting characters
 * (a NUL, a line break, a right-to-left override), no double quote, an extension that agrees
 * with the bytes, and at most 255 characters, counted as Postgres counts them.
 */
export function noteImageFileName(
  name: string,
  type: NoteImageContentType,
): string {
  const extensions = EXTENSIONS[type];
  const lastPart = name.slice(
    Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1,
  );

  const cleaned = lastPart
    .replaceAll(/[\p{Cc}\p{Cf}]/gu, '')
    .replaceAll('"', "'")
    .replaceAll(/\s+/g, ' ')
    .trim();

  const dot = cleaned.lastIndexOf('.');
  const typed = dot <= 0 ? '' : cleaned.slice(dot + 1);
  const kept = extensions.includes(typed.toLowerCase());

  // A name whose extension disagrees with its bytes loses it: the proven one is the only one
  // the name may end in ("gambar.jpg" of PNG bytes shows as "gambar.png").
  const extension = kept ? typed : extensions[0];
  const base = dot <= 0 ? cleaned : cleaned.slice(0, dot);
  const room = MAX_NAME_LENGTH - extension.length - 1;

  const shown = base.trim() === '' ? FALLBACK_NAME : base;
  return `${Array.from(shown).slice(0, room).join('')}.${extension}`;
}
