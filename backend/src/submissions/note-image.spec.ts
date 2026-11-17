import { PATH_METADATA } from '@nestjs/common/constants';
import { noteImageOf, revisionNoteImageUrl } from './note-image.js';
import { RevisionNoteImageController } from './revision-note-images.controller.js';

const IMAGE_ID = '22222222-2222-4222-8222-222222222222';

describe('revisionNoteImageUrl', () => {
  it('is the route the app mounts for opening an image, and nothing else (AC 6)', () => {
    // The URL the note's payload and the upload answer carry must name the very route the
    // controller serves; a mismatch sends every thumbnail to a 404.
    expect(Reflect.getMetadata(PATH_METADATA, RevisionNoteImageController)).toBe(
      'revision-note-images',
    );
    expect(
      Reflect.getMetadata(PATH_METADATA, RevisionNoteImageController.prototype.open),
    ).toBe(':imageId');

    expect(revisionNoteImageUrl(IMAGE_ID)).toBe(
      `/api/revision-note-images/${IMAGE_ID}`,
    );
  });
});

describe('noteImageOf', () => {
  it('names a stored image the way the panels read it', () => {
    expect(noteImageOf({ id: IMAGE_ID, content_type: 'image/png' })).toEqual({
      id: IMAGE_ID,
      url: `/api/revision-note-images/${IMAGE_ID}`,
      contentType: 'image/png',
    });
  });
});
