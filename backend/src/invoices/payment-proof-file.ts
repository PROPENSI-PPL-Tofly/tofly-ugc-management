import { UnprocessableEntityException } from '@nestjs/common';

// What a payment proof upload is allowed to be (PBI-13). The browser's declared type and the
// file's name are the uploader's claims; only the bytes decide what the file is, and the name is
// cleaned into something that is only ever shown.

/** The largest proof taken: 5 MB, the limit the admin's form states. */
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

export type ProofContentType = 'application/pdf' | 'image/jpeg' | 'image/png';

/** The part of a multer file the check reads. */
export interface UploadedProof {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export interface CheckedProof {
  bytes: Buffer;
  contentType: ProofContentType;
  fileName: string;
}

/** What each type's files start with. */
const SIGNATURES: readonly {
  type: ProofContentType;
  signature: readonly number[];
}[] = [
  // %PDF-
  { type: 'application/pdf', signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  {
    type: 'image/png',
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { type: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
];

/** The extensions a name of each type may carry; the first is added when it carries none. */
const EXTENSIONS: Record<ProofContentType, readonly string[]> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
};

const MAX_NAME_LENGTH = 255;
const FALLBACK_NAME = 'bukti-pembayaran';

export function proofInvalid(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'PROOF_INVALID',
    message: 'File bukti pembayaran harus PDF, JPG, atau PNG.',
  });
}

export function proofTooLarge(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'PROOF_TOO_LARGE',
    message: 'Ukuran file maksimal 5 MB.',
  });
}

function typeOf(bytes: Buffer) {
  return SIGNATURES.find(({ signature }) =>
    signature.every((byte, index) => bytes[index] === byte),
  );
}

/** The file as stored: its bytes, the type they prove, and a name safe to show. */
export function checkPaymentProof(
  file: UploadedProof | undefined,
): CheckedProof {
  if (!file || file.buffer.length === 0) throw proofInvalid();
  // Size first: an oversized file is refused for its size whatever it is.
  if (file.buffer.length > PROOF_MAX_BYTES) throw proofTooLarge();

  const match = typeOf(file.buffer);
  if (!match) throw proofInvalid();

  return {
    bytes: file.buffer,
    contentType: match.type,
    fileName: proofFileName(file.originalname, match.type),
  };
}

/**
 * The uploader's file name made safe to show: no folders, no control or formatting characters
 * (a NUL, a line break, a right-to-left override), no double quote, an extension that agrees with
 * the bytes, and at most 255 characters, counted as Postgres counts them.
 */
export function proofFileName(name: string, type: ProofContentType): string {
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
  const typed = dot === -1 ? '' : cleaned.slice(dot + 1);
  const kept = extensions.includes(typed.toLowerCase());

  const extension = kept ? typed : extensions[0];
  const base = kept ? cleaned.slice(0, dot) : cleaned;
  const room = MAX_NAME_LENGTH - extension.length - 1;

  const shown = base.trim() === '' ? FALLBACK_NAME : base;
  return `${Array.from(shown).slice(0, room).join('')}.${extension}`;
}
