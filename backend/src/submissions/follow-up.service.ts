import { ConflictException } from '@nestjs/common';
import { unauthenticated } from '../auth/creator-request.js';
import {
  ADMIN_ACTOR_NAME,
  adminActor,
  type AdminActor,
} from '../contents/content-event-actors.js';
import { noteImageOf, type NoteImage } from './note-image.js';
import { invalidRevisionImages } from './revise-submission.js';
import { submissionNotFound } from './review-errors.js';

// A follow-up note under a revision note already sent (PBI-33, 33.1). It is its own row, so the
// note the creator already read is never changed (AC 4), and it is kept only while that round is
// open: the content waits on the creator's revision and this is still the latest draft (AC 3).
// The timeline records it in the same transaction (AC 6).

/** What the admin's form (33.2) reads back: the saved follow-up, named by role only. */
export interface FollowUpDto {
  id: string;
  note: string;
  /** The follow-up's sanitized formatting, when it was written with any (PBI-34's editor). */
  noteHtml?: string;
  /** The screenshots it went out with (PBI-34), in the order the editor named them. */
  images?: NoteImage[];
  /** ISO instant the follow-up was saved. */
  at: string;
  actor: { name: string };
}

interface RoundRow {
  id: string;
  content_id: string;
  revision_notes: string | null;
  contents: { status: string; submissions: { id: string }[] };
}

interface FollowUpTransaction {
  /** Only read when the follow-up names screenshots, as a revision note's are. */
  revision_note_images: {
    findMany(args: {
      where: { id: { in: string[] }; submission_id: string; sent_at: null };
      select: { id: true; content_type: true };
    }): Promise<{ id: string; content_type: string }[]>;
    updateMany(args: {
      where: { id: { in: string[] }; submission_id: string };
      data: { sent_at: Date };
    }): Promise<unknown>;
  };
  users: {
    findUnique(args: {
      where: { id: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  revision_followups: {
    create(args: {
      data: { submission_id: string; body: string; author_user_id: string };
    }): Promise<{ id: string; body: string; created_at: Date }>;
  };
  content_events: {
    create(args: {
      data: AdminActor & {
        content_id: string;
        event_type: 'Revision Followup Added';
        occurred_at: Date;
        event_data: {
          note: string;
          note_html?: string;
          images?: { id: string; content_type: string }[];
          submission_id: string;
          follow_up_id: string;
        };
      };
    }): Promise<unknown>;
  };
}

/** The slice of Prisma this touches, so tests stub exactly that. */
export interface FollowUpClient {
  submissions: {
    findUnique(args: {
      where: { id: string };
      select: {
        id: true;
        content_id: true;
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
    }): Promise<RoundRow | null>;
  };
  $transaction<T>(
    work: (transaction: FollowUpTransaction) => Promise<T>,
  ): Promise<T>;
}

/** 409 (AC 3): the creator has answered the round with a new draft, or it was never opened. */
function roundClosed(): ConflictException {
  return new ConflictException({
    code: 'FOLLOWUP_ROUND_CLOSED',
    message: 'Creator sudah mengirim draft baru',
  });
}

// Open while the content waits on the creator's revision of this very draft: it carries the
// revision note, and no newer draft has come in after it (OWASP A01).
function isOpen(round: RoundRow): boolean {
  return (
    round.revision_notes !== null &&
    round.contents.status === 'draft_revision' &&
    round.contents.submissions[0]?.id === round.id
  );
}

export class FollowUpService {
  constructor(private readonly prisma: FollowUpClient) {}

  async add(
    submissionId: string,
    note: string,
    adminUserId: string,
    noteHtml?: string,
    imageIds: string[] = [],
  ): Promise<FollowUpDto> {
    const round = await this.prisma.submissions.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        content_id: true,
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
    if (!round) throw submissionNotFound();
    if (!isOpen(round)) throw roundClosed();

    return this.prisma.$transaction(async (transaction) => {
      const admin = await transaction.users.findUnique({
        where: { id: adminUserId },
        select: { id: true },
      });
      if (!admin) throw unauthenticated();

      // As a revision note's are: exactly the images the editor named, unsent and this draft's.
      // Each is marked sent here, so nothing already in the history can be taken down under it.
      const found =
        imageIds.length === 0
          ? []
          : await transaction.revision_note_images.findMany({
              where: {
                id: { in: imageIds },
                submission_id: submissionId,
                sent_at: null,
              },
              select: { id: true, content_type: true },
            });
      if (found.length !== imageIds.length) throw invalidRevisionImages();
      const byId = new Map(found.map((image) => [image.id, image]));
      const images = imageIds.map((id) => byId.get(id)!);

      const saved = await transaction.revision_followups.create({
        data: {
          submission_id: submissionId,
          body: note,
          author_user_id: admin.id,
        },
      });
      await transaction.content_events.create({
        data: {
          content_id: round.content_id,
          event_type: 'Revision Followup Added',
          ...adminActor(admin.id),
          occurred_at: saved.created_at,
          event_data: {
            note: saved.body,
            ...(noteHtml !== undefined && { note_html: noteHtml }),
            ...(images.length > 0 && { images }),
            submission_id: submissionId,
            follow_up_id: saved.id,
          },
        },
      });

      if (images.length > 0) {
        await transaction.revision_note_images.updateMany({
          where: { id: { in: imageIds }, submission_id: submissionId },
          data: { sent_at: saved.created_at },
        });
      }

      return {
        id: saved.id,
        note: saved.body,
        ...(noteHtml !== undefined && { noteHtml }),
        ...(images.length > 0 && { images: images.map(noteImageOf) }),
        at: saved.created_at.toISOString(),
        actor: { name: ADMIN_ACTOR_NAME },
      };
    });
  }
}
