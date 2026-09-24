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
}
