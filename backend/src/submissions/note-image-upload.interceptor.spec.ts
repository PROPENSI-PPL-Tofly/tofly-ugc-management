import { PayloadTooLargeException } from '@nestjs/common';
import { NoteImageUploadInterceptor } from './note-image-upload.interceptor.js';

const { multerRead } = vi.hoisted(() => ({ multerRead: vi.fn() }));

vi.mock('@nestjs/platform-express', () => ({
  FileInterceptor: () =>
    class {
      intercept = multerRead;
    },
}));

describe('NoteImageUploadInterceptor', () => {
  const context = {} as never;
  const next = {} as never;

  it('hands through what multer read untouched', async () => {
    const observable = Symbol('observable');
    multerRead.mockResolvedValue(observable);

    await expect(
      new NoteImageUploadInterceptor().intercept(context, next),
    ).resolves.toBe(observable);
  });

  it('words a file over the limit as the size refusal, not as Nest raw 413 (AC 4)', async () => {
    multerRead.mockRejectedValue(new PayloadTooLargeException());

    await expect(
      new NoteImageUploadInterceptor().intercept(context, next),
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'IMAGE_TOO_LARGE',
        message: 'Ukuran maksimal 5 MB',
      },
    });
  });

  it('words any other way the upload read wrong as the format refusal (AC 4)', async () => {
    multerRead.mockRejectedValue(new Error('busboy says no'));

    await expect(
      new NoteImageUploadInterceptor().intercept(context, next),
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'IMAGE_TYPE',
        message: 'Format harus JPG, PNG, atau WebP',
      },
    });
  });
});
