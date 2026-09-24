import { UnprocessableEntityException } from '@nestjs/common';

export function checkNewContent(input: unknown): void {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new UnprocessableEntityException({
      message: 'Data konten tidak valid',
      errors: {
        type: 'Jenis konten wajib dipilih',
        deadline: 'Tanggal deadline wajib diisi',
      },
    });
  }

  const body = input as Record<string, unknown>;
  const errors: Record<string, string> = {};

  if (typeof body.type !== 'string' || body.type.trim() === '') {
    errors.type = 'Jenis konten wajib dipilih';
  } else if (body.type !== 'evergreen' && body.type !== 'specific') {
    errors.type = 'Jenis konten harus evergreen atau specific';
  }

  if (typeof body.deadline !== 'string' || body.deadline.trim() === '') {
    errors.deadline = 'Tanggal deadline wajib diisi';
  }

  if (Object.keys(errors).length > 0) {
    throw new UnprocessableEntityException({
      message: 'Data konten tidak valid',
      errors,
    });
  }
}
