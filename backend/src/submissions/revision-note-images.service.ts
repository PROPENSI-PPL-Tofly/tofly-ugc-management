import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  noteAlreadySent,
  type CheckedNoteImage,
} from './revision-note-image-file.js';
import { revisionNoteImageUrl } from './note-image.js';

// The screenshots of a revision note (PBI-34, 34.1): the bytes go to the private bucket under
// an opaque key and the database keeps what the file is and who may see it (AC 6), as the
// payment proofs do. The upload refuses anything beyond five images or the type/size checks
// with its own reason per refusal (AC 4). Once the note has gone out, its images belong to the
// history: no more uploads for it and no taking down what the history shows (review).

/** What one image of a note answers to the browser. */
export interface RevisionNoteImageDto {
  id: string;
  /** Where the image is opened through; the short-lived signed link sits behind it. */
  url: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  /** Whether the image already went out with its note and is part of the history. */
  sent: boolean;
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

/** Two uploads counting at once can collide inside the serializable transaction (Prisma). */
function isSerializationCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  );
}

/** A follow-up may still be written: the content waits on this draft's revision, no newer draft yet. */
function followUpRoundOpen(submission: {
  id: string;
  contents: { status: string; submissions: { id: string }[] };
}): boolean {
  return (
    submission.contents.status === 'draft_revision' &&
    submission.contents.submissions[0]?.id === submission.id
  );
}

/** The database operations this service uses. */
export interface NoteImagesClient {
  submissions: {
    findUnique(args: {
      where: { id: string };
      select: {
        id: true;
        revision_notes: true;
        contents: {
          select: {
            status: true;
            submissions: {
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }];
              take: 1;
              select: { id: true };
            };
          };
        };
      };
    }): Promise<{
      id: string;
      revision_notes: string | null;
      contents: { status: string; submissions: { id: string }[] };
    } | null>;
  };
  revision_note_images: {
    count(args: {
      where: { submission_id: string; sent_at: null };
    }): Promise<number>;
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
      select: { object_key: true; sent_at: true };
    }): Promise<{ object_key: string; sent_at: Date | null } | null>;
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
    findMany(args: {
      where: { submission_id: string };
      select: {
        id: true;
        content_type: true;
        size_bytes: true;
        created_at: true;
        sent_at: true;
      };
      orderBy: [{ created_at: 'asc' }];
    }): Promise<
      {
        id: string;
        content_type: string;
        size_bytes: number;
        created_at: Date;
        sent_at: Date | null;
      }[]
    >;
    delete(args: { where: { id: string } }): Promise<unknown>;
  };
  $transaction<T>(
    callback: (transaction: NoteImagesClient) => Promise<T>,
    options: { isolationLevel: 'Serializable' },
  ): Promise<T>;
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
      select: {
        id: true,
        revision_notes: true,
        contents: {
          select: {
            status: true,
            submissions: {
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    });
    if (!submission) throw submissionNotFound();
    // Once the note has gone out, its images belong to the history (review). Only a follow-up
    // may still take screenshots, and only while its round is open: the content waits on the
    // creator's revision of this very draft, as FollowUpService reads it (OWASP A01).
    if (submission.revision_notes !== null && !followUpRoundOpen(submission)) {
      throw noteAlreadySent();
    }

    // Five screenshots to a note (AC 4), counted among those still to go out, so what a revision
    // note already sent does not use up a follow-up's room: refused before the bytes are taken,
    // then counted again inside the transaction below where two uploads cannot pass together.
    const held = await this.prisma.revision_note_images.count({
      where: { submission_id: submissionId, sent_at: null },
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

    // Uploads counting at once can collide inside the serializable transaction (Prisma P2034).
    // Each recount sees the winner's row; with up to five screenshots picked together (AC 3) a
    // recount can lose to another upload, so it is tried once per image a note can hold.
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.record(submissionId, objectKey, image, uploadedBy);
      } catch (error) {
        if (isSerializationCollision(error) && attempt < MAX_NOTE_IMAGES) continue;
        await this.removeUnrecorded(key);
        throw error;
      }
    }
  }

  /** Takes a screenshot off a note (AC 5): the record first, then its bytes. */
  async remove(submissionId: string, imageId: string): Promise<void> {
    const saved = await this.prisma.revision_note_images.findUnique({
      where: { id: imageId, submission_id: submissionId },
      select: { object_key: true, sent_at: true },
    });
    if (!saved) throw imageNotFound();
    // The history shows this image; taking it down would leave its link broken (review).
    if (saved.sent_at !== null) throw noteAlreadySent();

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

  /** What an editor holds for a note (review): every image, and whether it is already sent. */
  async list(submissionId: string): Promise<RevisionNoteImageDto[]> {
    const rows = await this.prisma.revision_note_images.findMany({
      where: { submission_id: submissionId },
      select: {
        id: true,
        content_type: true,
        size_bytes: true,
        created_at: true,
        sent_at: true,
      },
      orderBy: [{ created_at: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      url: revisionNoteImageUrl(row.id),
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at.toISOString(),
      sent: row.sent_at !== null,
    }));
  }

  private async record(
    submissionId: string,
    objectKey: string,
    image: CheckedNoteImage,
    uploadedBy: string,
  ): Promise<RevisionNoteImageDto> {
    const saved = await this.prisma.$transaction(
      async (transaction) => {
        const held = await transaction.revision_note_images.count({
          where: { submission_id: submissionId, sent_at: null },
        });
        if (held >= MAX_NOTE_IMAGES) throw imageLimitReached();

        return transaction.revision_note_images.create({
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
      },
      { isolationLevel: 'Serializable' },
    );

    return {
      id: saved.id,
      url: revisionNoteImageUrl(saved.id),
      contentType: image.contentType,
      sizeBytes: image.bytes.length,
      createdAt: saved.created_at.toISOString(),
      sent: false,
    };
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
