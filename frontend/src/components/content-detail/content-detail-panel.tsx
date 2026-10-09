"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CreatorLink } from "@/components/ui/creator-link";
import { LoadError } from "@/components/ui/load-error";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import {
  ContentDetailError,
  fetchContentDetail,
  type ActorRole,
  type ContentDetail,
  type CurrentStep,
  type TimelineEvent,
  type TimelineEventType,
} from "@/lib/content-detail";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_TONES,
  CONTENT_TYPE_LABELS,
} from "@/lib/content-labels";
import { daysUntil, formatDate, formatDue, formatTimestamp } from "@/lib/format";

/** Shown in the header until there is a content name to show instead. */
const DEFAULT_TITLE = "Detail Konten";

/** A brief longer than this is cut, with the rest one press away. */
const BRIEF_PREVIEW_LENGTH = 160;

const ROLE_LABELS: Record<ActorRole, string> = {
  admin: "Admin",
  creator: "Kreator",
};

const WAITING_LABELS: Record<ActorRole, string> = {
  admin: "Menunggu Admin",
  creator: "Menunggu kreator",
};

// The current step takes the colour the status badges use for the same situation: brand blue
// while the admin's decision is awaited, amber while the work is back with the creator.
const STEP_TONES: Record<ActorRole, { card: string; label: string; dot: string }> = {
  admin: { card: "border-accent bg-accent-wash", label: "text-accent-deep", dot: "ring-accent" },
  creator: { card: "border-amber bg-amber-wash", label: "text-amber-ink", dot: "ring-amber" },
};

// The dot beside each event, always next to its title so colour is never the only signal:
// brand blue where the content began, amber for a draft handed in, red for a revision asked,
// green from approval on, neutral for a comment.
const EVENT_DOTS: Record<TimelineEventType, string> = {
  scheduled: "bg-accent ring-accent",
  draft_submitted: "bg-amber ring-amber",
  revision_requested: "bg-red ring-red",
  draft_approved: "bg-green ring-green",
  link_submitted: "bg-green ring-green",
  creator_comment: "bg-rule ring-rule",
};

/** From this many days before the deadline on, the countdown is shown as a warning. */
const DUE_SOON_DAYS = 1;

const SECTION_LABEL = "mb-2 text-[11px] font-bold uppercase tracking-wider text-muted";

// One row of the timeline: the dot in a narrow first column, and a line drawn from under it to
// the next row, left off the last row.
const TIMELINE_ROW =
  "relative grid grid-cols-[13px_1fr] gap-3 pb-5 before:absolute before:bottom-0 before:left-[6px] before:top-4 before:w-px before:bg-rule last:pb-0 last:before:hidden";

// A filled disc with a gap and a ring of its own colour, so it reads as a marker on the line.
const DOT = "mt-[3px] size-[13px] rounded-full border-2 border-surface ring-[1.5px]";

// One state at a time: a loaded detail and an error can never be on screen together.
type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; detail: ContentDetail }
  | { kind: "not_found" }
  | { kind: "failed" };

/** "Rangga Pratama › Periode 2", from whichever of the two is known. */
function breadcrumb(detail: ContentDetail): string | undefined {
  const parts = [
    detail.creatorName,
    detail.periodNumber === null ? null : `Periode ${detail.periodNumber}`,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" › ") : undefined;
}

/** Red once the deadline has passed, amber from the day before it, green when finished. */
function dueTone(finished: boolean, days: number | null): string {
  if (finished) return "text-green-ink";
  if (days === null) return "";
  if (days < 0) return "text-red-ink";
  return days <= DUE_SOON_DAYS ? "text-amber-ink" : "";
}

function HeaderMeta({ detail, now }: Readonly<{ detail: ContentDetail; now?: Date }>) {
  // A finished content has no countdown left, however its deadline compares to today.
  const finished = detail.status === "link_submitted";
  const due = finished ? "Selesai" : formatDue(detail.deadline, now);
  const tone = dueTone(finished, daysUntil(detail.deadline, now));

  return (
    <>
      <Pill>{CONTENT_TYPE_LABELS[detail.type]}</Pill>

      <Pill tone={CONTENT_STATUS_TONES[detail.status]}>{CONTENT_STATUS_LABELS[detail.status]}</Pill>

      <span className="ml-1">
        Deadline <b className="font-semibold text-ink">{formatDate(detail.deadline)}</b> ·{" "}
        <span data-testid="deadline-due" className={`font-semibold ${tone}`}>
          {due}
        </span>
      </span>
    </>
  );
}

function Brief({ brief }: Readonly<{ brief: string }>) {
  const [expanded, setExpanded] = useState(false);
  const long = brief.length > BRIEF_PREVIEW_LENGTH;
  const shown = long && !expanded ? `${brief.slice(0, BRIEF_PREVIEW_LENGTH)}…` : brief;

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className={SECTION_LABEL}>Brief</h3>

        {long ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="mb-2 cursor-pointer rounded-(--radius-control) border-none bg-transparent p-0 text-xs font-semibold text-accent-deep hover:underline"
          >
            {expanded ? "Ringkas" : "Selengkapnya"}
          </button>
        ) : null}
      </div>

      <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{shown}</p>
    </section>
  );
}

function EventItem({ event }: Readonly<{ event: TimelineEvent }>) {
  return (
    <li className={TIMELINE_ROW}>
      <span aria-hidden="true" data-timeline-dot="" className={`${DOT} ${EVENT_DOTS[event.type]}`} />

      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold">
          {event.title}
          <time dateTime={event.timestamp} className="text-[11.5px] font-normal text-muted">
            {formatTimestamp(event.timestamp)}
          </time>
        </p>

        <p className="mt-0.5 text-[11.5px] text-muted">
          {event.actorName} · {ROLE_LABELS[event.actorRole]}
        </p>

        {event.link && event.linkLabel ? (
          <div className="mt-2">
            <CreatorLink link={event.link} label={event.linkLabel} look="chip" />
          </div>
        ) : null}

        {event.note ? (
          <blockquote className="mt-2 rounded-r-(--radius-control) border-l-2 border-rule bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed">
            <span className="mb-0.5 block text-[11px] font-semibold text-muted">{event.noteBy}</span>
            <p className="whitespace-pre-line">{event.note}</p>
          </blockquote>
        ) : null}
      </div>
    </li>
  );
}

/** The step the content is waiting on. Whatever acts on it (subtask 6.6) arrives as `actions`. */
function CurrentStepItem({ step, actions }: Readonly<{ step: CurrentStep; actions?: ReactNode }>) {
  const tone = STEP_TONES[step.waitingFor];

  return (
    <li className={TIMELINE_ROW}>
      {/* Hollow: this step has not happened yet. */}
      <span aria-hidden="true" data-timeline-dot="" className={`${DOT} bg-surface ${tone.dot}`} />

      <div className={`flex min-w-0 flex-col gap-1.5 rounded-(--radius-panel) border p-3.5 ${tone.card}`}>
        <p className={`text-[11px] font-bold uppercase tracking-wider ${tone.label}`}>
          {WAITING_LABELS[step.waitingFor]}
        </p>

        <p className="text-sm font-semibold">{step.title}</p>

        {actions}
      </div>
    </li>
  );
}

function Timeline({ detail, actions }: Readonly<{ detail: ContentDetail; actions?: ReactNode }>) {
  const empty = detail.currentStep === null && detail.events.length === 0;

  return (
    <section>
      <h3 className={SECTION_LABEL}>Timeline</h3>

      {empty ? (
        <p className="text-xs text-muted">Belum ada aktivitas.</p>
      ) : (
        <ol aria-label="Timeline">
          {detail.currentStep ? (
            <CurrentStepItem step={detail.currentStep} actions={actions} />
          ) : null}

          {detail.events.map((event) => (
            <EventItem key={`${event.timestamp}|${event.title}`} event={event} />
          ))}
        </ol>
      )}
    </section>
  );
}

function PanelBody({ detail, actions }: Readonly<{ detail: ContentDetail; actions?: ReactNode }>) {
  return (
    <div className="flex flex-col gap-5">
      {/* Evergreen content has no brief. */}
      {detail.type === "specific" && detail.brief ? <Brief brief={detail.brief} /> : null}

      <Timeline detail={detail} actions={actions} />
    </div>
  );
}

function StatusMessage({
  state,
  onRetry,
}: Readonly<{ state: Exclude<LoadState, { kind: "loaded" }>; onRetry: () => void }>) {
  if (state.kind === "loading") {
    return <p className="py-6 text-center text-[13px] text-muted">Memuat konten...</p>;
  }

  if (state.kind === "not_found") {
    return <p className="py-6 text-center text-[13px] text-red-ink">Konten tidak ditemukan.</p>;
  }

  return <LoadError title="Detail konten gagal dimuat" onRetry={onRetry} />;
}

/**
 * The Content Detail panel (PBI-6): one content's type, status, deadline and brief, and under
 * them a single timeline, newest first, with the step it is waiting on at the top. It is the
 * same sheet wherever a content is opened from; the caller only says which content and how to
 * close. Acting on the current step is not this component's job: it comes in through `actions`.
 */
export function ContentDetailPanel({
  contentId,
  onClose,
  actions,
  load = fetchContentDetail,
  now,
}: Readonly<{
  contentId: string;
  onClose: () => void;
  /** Shown on the current step once there is one to act on. */
  actions?: ReactNode;
  /** Where the detail comes from; the API by default, a stub in tests. */
  load?: (contentId: string) => Promise<ContentDetail>;
  /** The moment "today" is read from; the current one by default, a fixed one in tests. */
  now?: Date;
}>) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  // No reset on contentId here: the caller keys this component by content, so a different
  // content is a fresh mount starting from "loading".
  useEffect(() => {
    let cancelled = false;

    load(contentId)
      .then((detail) => {
        if (!cancelled) setState({ kind: "loaded", detail });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const notFound = error instanceof ContentDetailError && error.status === 404;
        setState({ kind: notFound ? "not_found" : "failed" });
      });

    return () => {
      cancelled = true;
    };
  }, [load, contentId, attempt]);

  function retry() {
    setState({ kind: "loading" });
    setAttempt((count) => count + 1);
  }

  if (state.kind !== "loaded") {
    return (
      <Modal title={DEFAULT_TITLE} onClose={onClose} placement="side">
        <StatusMessage state={state} onRetry={retry} />
      </Modal>
    );
  }

  const { detail } = state;

  return (
    <Modal
      title={detail.name}
      onClose={onClose}
      placement="side"
      eyebrow={breadcrumb(detail)}
      meta={<HeaderMeta detail={detail} now={now} />}
    >
      <PanelBody detail={detail} actions={actions} />
    </Modal>
  );
}
