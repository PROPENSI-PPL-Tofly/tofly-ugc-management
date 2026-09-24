import { UnprocessableEntityException } from '@nestjs/common';

export function checkNewContent(input: unknown): void {
  if (input === null) {
    throw new UnprocessableEntityException({
      message: 'Data konten tidak valid',
      errors: {
        type: 'Jenis konten wajib dipilih',
        deadline: 'Tanggal deadline wajib diisi',
      },
    });
  }
}
