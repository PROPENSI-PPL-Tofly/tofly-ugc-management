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

  if (body.type === 'specific') {
  if (typeof body.name !== 'string' || body.name.trim() === '') {
    errors.name = 'Nama konten wajib diisi';
  }

  if (typeof body.brief !== 'string' || body.brief.trim() === '') {
    errors.brief = 'Brief wajib diisi';
  }
}

  if (Object.keys(errors).length > 0) {
    throw new UnprocessableEntityException({
      message: 'Data konten tidak valid',
      errors,
    });
  }
}
