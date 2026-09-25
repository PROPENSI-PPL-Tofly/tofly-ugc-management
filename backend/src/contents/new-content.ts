import { UnprocessableEntityException } from '@nestjs/common';

export interface NewContent {
  contractId: string;
  type: 'evergreen' | 'specific';
  deadline: string;
  name?: string;
  brief?: string;
}

/** Longer than any real title; keeps a hostile body from filling contents.name (text). */
export const MAX_CONTENT_NAME_LENGTH = 200;
/** Room for a detailed brief; keeps a hostile body from filling contents.brief (text). */
export const MAX_BRIEF_LENGTH = 5000;

export function checkNewContent(input: unknown): NewContent {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new UnprocessableEntityException({
      message: 'Data konten tidak valid',
      errors: {
        contractId: 'Kontrak wajib dipilih',
        type: 'Jenis konten wajib dipilih',
        deadline: 'Tanggal deadline wajib diisi',
      },
    });
  }

  const body = input as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const UUID_FORMAT =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (typeof body.contractId !== 'string' || body.contractId.trim() === '') {
    errors.contractId = 'Kontrak wajib dipilih';
  } else if (!UUID_FORMAT.test(body.contractId)) {
    errors.contractId = 'ID kontrak tidak valid';
  }

  if (typeof body.type !== 'string' || body.type.trim() === '') {
    errors.type = 'Jenis konten wajib dipilih';
  } else if (body.type !== 'evergreen' && body.type !== 'specific') {
    errors.type = 'Jenis konten harus evergreen atau specific';
  }

  if (typeof body.deadline !== 'string' || body.deadline.trim() === '') {
    errors.deadline = 'Tanggal deadline wajib diisi';
  } else {
    const deadline = body.deadline;
    const dateFormat = /^\d{4}-\d{2}-\d{2}$/;

    if (!dateFormat.test(deadline)) {
      errors.deadline = 'Format tanggal deadline tidak valid';
    } else {
      const parsedDate = new Date(`${deadline}T00:00:00.000Z`);

      if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== deadline
      ) {
        errors.deadline = 'Format tanggal deadline tidak valid';
      }
    }
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const brief = typeof body.brief === 'string' ? body.brief.trim() : '';

  if (body.type === 'specific') {
    if (name === '') {
      errors.name = 'Nama konten wajib diisi';
    } else if (name.length > MAX_CONTENT_NAME_LENGTH) {
      errors.name = `Nama konten maksimal ${MAX_CONTENT_NAME_LENGTH} karakter`;
    }

    if (brief === '') {
      errors.brief = 'Brief wajib diisi';
    } else if (brief.length > MAX_BRIEF_LENGTH) {
      errors.brief = `Brief maksimal ${MAX_BRIEF_LENGTH} karakter`;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new UnprocessableEntityException({
      message: 'Data konten tidak valid',
      errors,
    });
  }
  return {
    contractId: body.contractId as string,
    type: body.type as NewContent['type'],
    deadline: body.deadline as string,
    ...(body.type === 'specific' ? { name, brief } : {}),
  };
}
