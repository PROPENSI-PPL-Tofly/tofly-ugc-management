import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { content_status, social_platform } from '@prisma/client';
import { joinName } from '../creators/evergreen.js';
import {
  invoiceState,
  type InvoiceLifecycleStatus,
} from '../invoices/invoice-lifecycle.js';
import { canSubmitVideo } from '../me/task-actions.js';
import { adminActor } from './content-event-actors.js';
import { normalizeVideoLink } from './content-links.js';
import type { PlatformLink } from './link-request.js';
import { LINK_RULES } from './link-rules.js';

// Submitting, adding and replacing a content's video links (PBI-38 38.2). Each change is a
// command object that turns the content as it was read into a plan of writes, with no database
// in sight (Command). The shared steps, the invoice lock first, live once in LinkChange.plan and
// each command fills in only its own rules (Template Method). The service runs the plan in one
// transaction, so these rules are tested on plain values.

/** One reading of the clock: the store keeps the Jakarta day, the timeline the moment. */
export interface LinkClock {
  now: Date;
  /** ISO day in Jakarta (jakartaDay). */
  today: string;
}

/** The content as the service reads it in one query: everything a link change decides on. */
export interface LinkedContent {
  id: string;
  status: content_status;
  deadline: Date;
  video_submitted_at: Date | null;
  content_links: {
    id: string;
    platform: social_platform | null;
    url: string;
    submitted_at: Date;
  }[];
  contracts: {
    /** No row yet means the invoice is still running. */
    invoice: { status: InvoiceLifecycleStatus } | null;
    creators: {
      user_id: string;
      first_name: string;
      middle_name: string | null;
      last_name: string | null;
      social_accounts: { platform: social_platform }[];
    };
  };
}

export interface LinkEventActor {
  actor_name: string;
  actor_role: 'creator' | 'admin';
  actor_user_id: string | null;
}

/** Who changes the links: which contents they reach, and how the store and timeline name them. */
export interface LinkActor {
  /** Added to the content lookup, so a content out of reach reads as missing (OWASP A01). */
  readonly scope: { contracts: { creator_id: string } } | Record<string, never>;
  /** The users.id stored as the link's submitted_by. */
  submittedBy(content: LinkedContent): string;
  eventActor(content: LinkedContent): LinkEventActor;
}

export class CreatorLinkActor implements LinkActor {
  readonly scope: { contracts: { creator_id: string } };

  constructor(creatorId: string) {
    this.scope = { contracts: { creator_id: creatorId } };
  }

  submittedBy(content: LinkedContent): string {
    return content.contracts.creators.user_id;
  }

  eventActor(content: LinkedContent): LinkEventActor {
    return {
      actor_name: joinName(content.contracts.creators),
      actor_role: 'creator',
      actor_user_id: null,
    };
  }
}

export class AdminLinkActor implements LinkActor {
  readonly scope: Record<string, never> = {};

  /** Null only for the local development stand-in for sign-in, which has no account. */
  constructor(private readonly adminUserId: string | null) {}

  submittedBy(content: LinkedContent): string {
    // submitted_by must name a user; with no admin account the link stays the creator's.
    return this.adminUserId ?? content.contracts.creators.user_id;
  }

  eventActor(): LinkEventActor {
    return adminActor(this.adminUserId);
  }
}

/**
 * Columns a replaced link's performance numbers live in, each set back to null in the same
 * update as the url (AC 9). Empty until PBI-27 adds the numbers to content_links.
 */
export type PerformanceColumns = Readonly<Record<string, null>>;

export const NO_PERFORMANCE_COLUMNS: PerformanceColumns = Object.freeze({});

export interface StoredLink {
  content_id: string;
  platform: social_platform;
  url: string;
  normalized_url: string;
  submitted_at: Date;
  submitted_by: string;
}

export interface LinkEvent extends LinkEventActor {
  content_id: string;
  event_type: 'Link Submitted' | 'Link Replaced';
  occurred_at: Date;
  event_data: {
    link: string;
    platform: social_platform;
    previous_link?: string;
  };
}

/** What the submit and replace routes answer: the content's links after the change. */
export interface ContentLinksResult {
  contentId: string;
  status: 'link_submitted';
  /** The content's submitted day (the first link's), ISO. */
  submittedAt: string;
  links: {
    platform: social_platform | null;
    url: string;
    submittedAt: string;
  }[];
}

/** The writes a change needs, which the service runs in one transaction. */
export interface LinkPlan {
  /** Compare-and-set on the status read, so two first submits cannot both win. */
  statusChange?: {
    from: content_status;
    data: {
      status: 'link_submitted';
      video_submitted_at: Date;
      approval_bypassed: boolean;
    };
  };
  creates: StoredLink[];
  /** Compare-and-set on the url read, so two replacements cannot both win. */
  replace?: {
    id: string;
    fromUrl: string;
    // Index-typed beside the named columns, so PBI-27's numbers are cleared in the same update.
    data: Omit<StoredLink, 'content_id' | 'platform'> & Record<string, unknown>;
  };
  events: LinkEvent[];
  result: ContentLinksResult;
}

/** The row moved between being read and being written, so what was read says nothing now. */
export const CONTENT_CHANGED =
  'Status konten ini baru saja berubah. Muat ulang lalu coba lagi';

// What opens the first link for content in each status canSubmitVideo can refuse. H-1 skips an
// approval and never the draft, so before a draft the next step is the draft (PBI-7 7.2).
const NEXT_STEPS: Partial<Record<content_status, string>> = {
  scheduled: 'Kirim draft dulu sebelum mengirim link video',
  draft_revision: 'Kirim ulang draft dulu sebelum mengirim link video',
  draft_review:
    'Link video bisa dikirim setelah draft disetujui, atau mulai H-1 deadline',
};

export function notEligible(message: string): ConflictException {
  return new ConflictException({ code: 'VIDEO_NOT_ELIGIBLE', message });
}

function fieldError(
  platform: social_platform,
  message: string,
): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Data link video tidak valid',
    errors: { [platform]: message },
  });
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayOf(today: string): Date {
  return new Date(`${today}T00:00:00.000Z`);
}

/** The links as handed in, oldest first; a sort that keeps ties in the order given. */
function asHandedIn(
  links: {
    platform: social_platform | null;
    url: string;
    submitted_at: Date;
  }[],
): ContentLinksResult['links'] {
  return [...links]
    .sort((a, b) => a.submitted_at.getTime() - b.submitted_at.getTime())
    .map((link) => ({
      platform: link.platform,
      url: link.url,
      submittedAt: isoDay(link.submitted_at),
    }));
}

export abstract class LinkChange {
  /**
   * The plan for this change, or the refusal. The invoice lock comes first: once the invoice is
   * finalized nothing about the links may move, whatever else is wrong (AC 8, 9; OWASP A08).
   */
  plan(content: LinkedContent, actor: LinkActor, clock: LinkClock): LinkPlan {
    invoiceState(
      content.contracts.invoice?.status ?? 'running',
    ).assertCanChangeLinks();
    return this.planChange(content, actor, clock);
  }

  protected abstract planChange(
    content: LinkedContent,
    actor: LinkActor,
    clock: LinkClock,
  ): LinkPlan;
}

/**
 * One or more new platform links. The first links move the content to Link Dikirim and set its
 * submitted day (AC 7); a link for another platform later only adds itself (AC 8).
 */
export class SubmitLinks extends LinkChange {
  constructor(private readonly links: readonly PlatformLink[]) {
    super();
  }

  protected planChange(
    content: LinkedContent,
    actor: LinkActor,
    clock: LinkClock,
  ): LinkPlan {
    const accounts = new Set(
      content.contracts.creators.social_accounts.map(
        (account) => account.platform,
      ),
    );
    const missing = this.links.find((link) => !accounts.has(link.platform));
    if (missing) {
      throw fieldError(
        missing.platform,
        `Creator belum punya akun ${LINK_RULES[missing.platform].label}`,
      );
    }

    const taken = this.links.find((link) =>
      content.content_links.some((stored) => stored.platform === link.platform),
    );
    if (taken) {
      throw new ConflictException({
        code: 'LINK_EXISTS',
        message: `Link ${LINK_RULES[taken.platform].label} sudah dikirim. Gunakan Ganti Link untuk menggantinya`,
      });
    }

    const today = dayOf(clock.today);
    const statusChange = this.statusChange(content, clock, today);
    const submittedBy = actor.submittedBy(content);
    const creates = this.links.map((link) => ({
      content_id: content.id,
      platform: link.platform,
      url: link.url,
      normalized_url: normalizeVideoLink(link.url),
      submitted_at: today,
      submitted_by: submittedBy,
    }));
    const by = actor.eventActor(content);

    return {
      statusChange,
      creates,
      events: this.links.map((link) => ({
        content_id: content.id,
        event_type: 'Link Submitted',
        ...by,
        occurred_at: clock.now,
        event_data: { link: link.url, platform: link.platform },
      })),
      result: {
        contentId: content.id,
        status: 'link_submitted',
        submittedAt: isoDay(content.video_submitted_at ?? today),
        links: asHandedIn([...content.content_links, ...creates]),
      },
    };
  }

  /** None for a later link; for the first, the move to Link Dikirim, if the window is open. */
  private statusChange(
    content: LinkedContent,
    clock: LinkClock,
    today: Date,
  ): LinkPlan['statusChange'] {
    if (content.status === 'link_submitted') {
      if (content.content_links.length === 0) {
        throw notEligible(CONTENT_CHANGED);
      }
      return undefined;
    }
    if (
      !canSubmitVideo(content.status, isoDay(content.deadline), clock.today)
    ) {
      throw notEligible(NEXT_STEPS[content.status] ?? CONTENT_CHANGED);
    }
    return {
      from: content.status,
      data: {
        status: 'link_submitted',
        video_submitted_at: today,
        // A link before the draft's approval skipped it, which the admin's views flag.
        approval_bypassed: content.status !== 'draft_approved',
      },
    };
  }
}

/**
 * Another link in place of one platform's link (AC 9). The link is dated today, but the
 * content's submitted day, which lateness reads, stays the first hand-in's (AC 8).
 */
export class ReplaceLink extends LinkChange {
  constructor(
    private readonly link: PlatformLink,
    private readonly cleared: PerformanceColumns,
  ) {
    super();
  }

  protected planChange(
    content: LinkedContent,
    actor: LinkActor,
    clock: LinkClock,
  ): LinkPlan {
    const { platform, url } = this.link;
    const current = content.content_links.find(
      (link) => link.platform === platform,
    );
    if (!current) {
      throw new NotFoundException({
        code: 'LINK_NOT_FOUND',
        message: `Belum ada link ${LINK_RULES[platform].label} untuk konten ini`,
      });
    }
    const normalized = normalizeVideoLink(url);
    if (normalized === normalizeVideoLink(current.url)) {
      throw fieldError(
        platform,
        'Link baru sama dengan link yang sudah dikirim',
      );
    }

    const today = dayOf(clock.today);
    return {
      creates: [],
      replace: {
        id: current.id,
        fromUrl: current.url,
        data: {
          ...this.cleared,
          url,
          normalized_url: normalized,
          submitted_at: today,
          submitted_by: actor.submittedBy(content),
        },
      },
      events: [
        {
          content_id: content.id,
          event_type: 'Link Replaced',
          ...actor.eventActor(content),
          occurred_at: clock.now,
          event_data: { link: url, platform, previous_link: current.url },
        },
      ],
      result: {
        contentId: content.id,
        status: 'link_submitted',
        submittedAt: isoDay(content.video_submitted_at ?? current.submitted_at),
        links: asHandedIn(
          content.content_links.map((link) =>
            link === current ? { ...link, url, submitted_at: today } : link,
          ),
        ),
      },
    };
  }
}
