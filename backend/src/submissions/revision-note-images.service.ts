import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  FILE_STORE,
  type FileStore,
  type OpenedFile,
} from '../storage/file-store.js';
import { submissionNotFound } from './review-errors.js';
import {
  imageLimitReached,
  MAX_NOTE_IMAGES,
  type CheckedNoteImage,
} from './revision-note-image-file.js';
import { revisionNoteImageUrl } from './note-image.js';

// The screenshots of a revision note (PBI-34, 34.1): the bytes go to the private bucket under
// an opaque key and the database keeps what the file is and who may see it (AC 6), as the
// payment proofs do. The upload refuses anything beyond five images or the type/size checks
// with its own reason per refusal (AC 4).

/** What one image of a note answers to the browser. */
export interface RevisionNoteImageDto {
  id: string;
  /** Where the image is opened through; the short-lived signed link sits behind it. */
  url: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

/** Nest token for a fixed object-key factory; nothing provides it outside tests. */
export const NOTE_IMAGE_KEY_FACTORY = Symbol('NOTE_IMAGE_KEY_FACTORY');

/** Every image is stored under this prefix, then the UUID kept in object_key. */
const KEY_PREFIX = 'revision-note-images';

function keyOf(objectKey: string): string {
  return `${KEY_PREFIX}/${objectKey}`;
}

function imageNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'IMAGE_NOT_FOUND',
    message: 'Gambar tidak ditemukan',
  });
}

/** The database operations this service uses. */
export interface NoteImagesClient {
  submissions: {
    findUnique(args: {
      where: { id: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  revision_note_images: {
    count(args: { where: { submission_id: string } }): Promise<number>;
    create(args: {
      data: {
        submission_id: string;
        object_key: string;
        file_name: string;
        content_type: string;
        size_bytes: number;
        uploaded_by: string;
      };
      select: { id: true; created_at: true };
    }): Promise<{ id: string; created_at: Date }>;
    findUnique(args: {
      where: { id: string; submission_id: string };
      select: { object_key: true };
    }): Promise<{ object_key: string } | null>;
    findFirst(args: {
      where: {
        id: string;
        submissions?: { contents: { contracts: { creator_id: string } } };
      };
      select: { object_key: true; file_name: true; content_type: true };
    }): Promise<{
      object_key: string;
      file_name: string;
      content_type: string;
    } | null>;
    delete(args: { where: { id: string } }): Promise<unknown>;
  };
}

@Injectable()
export class RevisionNoteImagesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: NoteImagesClient,
    @Inject(FILE_STORE) private readonly store: FileStore,
    // Tests name the key; the app leaves it to a fresh random UUID per upload.
    @Optional()
    @Inject(NOTE_IMAGE_KEY_FACTORY)
    private readonly newObjectKey: () => string = randomUUID,
  ) {}

  /** One screenshot on a note (AC 3): the bytes go to the bucket first, then the record. */
  async upload(
    submissionId: string,
    image: CheckedNoteImage,
    uploadedBy: string,
  ): Promise<RevisionNoteImageDto> {
    const submission = await this.prisma.submissions.findUnique({
      where: { id: submissionId },
      select: { id: true },
    });
    if (!submission) throw submissionNotFound();

    // Five screenshots to a note (AC 4). Two admins uploading at once can read the count
    // together; the editor is one form, so the check is a guard, not a lock.
    const held = await this.prisma.revision_note_images.count({
      where: { submission_id: submissionId },
    });
    if (held >= MAX_NOTE_IMAGES) throw imageLimitReached();

    const objectKey = this.newObjectKey();
    const key = keyOf(objectKey);
    try {
      await this.store.put(key, image.bytes, image.contentType);
    } catch {
      throw new ServiceUnavailableException({
        code: 'IMAGE_STORAGE_UNAVAILABLE',
        message: 'Gambar gagal disimpan. Coba lagi.',
      });
    }

    try {
      const saved = await this.prisma.revision_note_images.create({
        data: {
          submission_id: submissionId,
          object_key: objectKey,
          file_name: image.fileName,
          content_type: image.contentType,
          size_bytes: image.bytes.length,
          uploaded_by: uploadedBy,
        },
        select: { id: true, created_at: true },
      });

      return {
        id: saved.id,
        url: revisionNoteImageUrl(saved.id),
        contentType: image.contentType,
        sizeBytes: image.bytes.length,
        createdAt: saved.created_at.toISOString(),
      };
    } catch (error) {
      await this.removeUnrecorded(key);
      throw error;
    }
  }

  /** Takes a screenshot off a note (AC 5): the record first, then its bytes. */
  async remove(submissionId: string, imageId: string): Promise<void> {
    const saved = await this.prisma.revision_note_images.findUnique({
      where: { id: imageId, submission_id: submissionId },
      select: { object_key: true },
    });
    if (!saved) throw imageNotFound();

    await this.prisma.revision_note_images.delete({ where: { id: imageId } });
    await this.removeUnrecorded(keyOf(saved.object_key));
  }

  /** Opens a screenshot (AC 6): an admin any image, a creator only their own content's. */
  async open(
    imageId: string,
    { creatorId }: { creatorId?: string },
  ): Promise<OpenedFile> {
    const saved = await this.prisma.revision_note_images.findFirst({
      where: {
        id: imageId,
        ...(creatorId !== undefined && {
          submissions: { contents: { contracts: { creator_id: creatorId } } },
        }),
      },
      select: { object_key: true, file_name: true, content_type: true },
    });

    const opened =
      saved &&
      (await this.store.open(keyOf(saved.object_key), {
        fileName: saved.file_name,
        contentType: saved.content_type,
      }));

    if (!opened) throw imageNotFound();
    return opened;
  }

  /** Bytes nothing records anymore are the cleanup's to find; the caller's answer stands. */
  private async removeUnrecorded(key: string): Promise<void> {
    try {
      await this.store.remove(key);
    } catch {
      // Nothing more to do: the recorded answer has already been decided.
    }
  }
}
