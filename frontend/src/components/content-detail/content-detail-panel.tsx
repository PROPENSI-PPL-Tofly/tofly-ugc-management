"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ContentTags } from "@/components/contents/content-tags";
import { Button } from "@/components/ui/button";
import { CharLimit } from "@/components/ui/char-limit";
import { CreatorLink } from "@/components/ui/creator-link";
import { LoadError } from "@/components/ui/load-error";
import { Modal } from "@/components/ui/modal";
import { StatusDot } from "@/components/ui/pill";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_TONES,
  CONTENT_TYPE_LABELS,
} from "@/lib/content-labels";
import {
  ContentDetailError,
  describeJourney,
  fetchContentDetail,
  type ContentDetail,
  type ContentDetailLoader,
  type DetailEventType,
  type JourneyStep,
} from "@/lib/content-detail";
import {
  approveSubmission,
  DraftReviewActionError,
  reviseSubmission,
} from "@/lib/draft-review-actions";
import { daysUntil, formatDate, formatDaysLeft, formatTimestamp } from "@/lib/format";
import {
  actionsFor,
  submitRejection,
  submitRevision,
  type PanelActionKind,
  type PanelActionPorts,
  type PanelCommand,
} from "@/lib/panel-actions";
import { approveProposal, rejectProposal } from "@/lib/proposal-actions";
import type { Role } from "@/lib/session";

/** The API's limit on a revision note (backend revise-submission.ts). */
export const MAX_REVISION_NOTE_LENGTH = 1000;

/** A decision the panel can send, named for the touchpoint that confirms it. */
export type Decision = "approve" | "revise" | "approve_proposal" | "reject_proposal";

/** How each decision is confirmed once the panel has closed; the touchpoint shows it. */
export const DECISION_CONFIRMATIONS: Record<Decision, string> = {
  approve: "Draft di-approve. Kreator bisa kirim link video.",
  revise: "Permintaan revisi terkirim ke kreator.",
  approve_proposal: "Pengajuan disetujui. Konten masuk jadwal kreator.",
  reject_proposal: "Pengajuan ditolak dan dihapus.",
};

/** The API's limit on a rejection reason (backend proposal-review.ts). */
export const MAX_REJECT_REASON_LENGTH = 1000;

/** Shown in the header until there is a content name to show instead. */
const DEFAULT_TITLE = "Detail Konten";

// One state at a time: a loaded detail and an error can never be on screen together.
type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; detail: ContentDetail }
  | { kind: "not_found" }
  | { kind: "failed" };

/** A brief longer than this is cut, with the rest one press away. */
const BRIEF_PREVIEW_LENGTH = 160;

/** From this many days before the deadline on, the countdown is shown as a warning. */
const DUE_SOON_DAYS = 1;

type WaitingOn = ContentDetail["waitingOn"];

const ROLE_LABELS: Record<"admin" | "creator", string> = {
  admin: "Admin",
  creator: "Kreator",
};

/** The step's waiting side reads the same however the status spells it. */
const WAITING_LABELS: Record<"admin" | "creator", string> = {
  admin: "Menunggu Admin",
  creator: "Menunggu kreator",
};

// The current step takes the colour the status dots use for the same situation: brand blue
// while the admin's decision is awaited, amber while the work is back with the creator, green
// once nothing is left to do.
const STEP_TONES: Record<"admin" | "creator" | "done", { card: string; label: string }> = {
  admin: { card: "border-accent bg-accent-wash", label: "text-accent-deep" },
  creator: { card: "border-amber bg-amber-wash", label: "text-amber-ink" },
  done: { card: "border-green bg-green-wash", label: "text-green-ink" },
};

// The two decisions that start with a form rather than a request: what the form asks for, and
// which footer command opened it (so focus can go back to it on Batal).
type FormKind = "revise" | "reject";

interface FormSpec {
  label: string;
  placeholder: string;
  required: boolean;
  max: number;
  decision: Decision;
  opener: PanelActionKind;
}

const FORMS: Record<FormKind, FormSpec> = {
  revise: {
    label: "Catatan revisi untuk creator",
    placeholder: "mis. Warna kurang kontras, mohon perbaiki bagian intro...",
    required: true,
    max: MAX_REVISION_NOTE_LENGTH,
    decision: "revise",
    opener: "revise",
  },
  // The reason is optional (PRD 3.10): rejecting with an empty form is allowed.
  reject: {
    label: "Alasan penolakan (opsional)",
    placeholder: "mis. Belum sesuai rencana kampanye bulan ini...",
    required: false,
    max: MAX_REJECT_REASON_LENGTH,
    decision: "reject_proposal",
    opener: "reject_proposal",
  },
};

/** The footer commands that only open a form; every other command sends its decision. */
const OPENS_FORM: ReadonlySet<PanelActionKind> = new Set<PanelActionKind>([
  "revise",
  "reject_proposal",
]);

/** Where the admin reads the step differently from the creator: their own decision is due. */
const ADMIN_STEP_TEXT: Partial<Record<ContentDetail["status"], string>> = {
  pending:
    "Kreator mengajukan konten ini. Setujui untuk menjadwalkannya, atau tolak untuk menghapusnya.",
};

/** One line of context under the waiting side, per status. */
const STEP_TEXT: Record<ContentDetail["status"], string> = {
  pending: "Pengajuan sedang ditinjau Admin.",
  scheduled: "Kreator belum kirim draft.",
  draft_review: "Draft sedang ditinjau Admin.",
  draft_revision: "Menunggu draft revisi dari kreator.",
  draft_approved: "Menunggu link video final.",
  link_submitted: "Link video sudah dikirim.",
};

// The dot beside each event, always next to its title so colour is never the only signal. It
// takes the tone of the status the event led to, as the status dots do: neutral once scheduled,
// brand blue for a draft waiting on the admin, amber for one sent back, green from approval on.
// Red is left to a missed deadline, which the Overdue and Late Submission tags carry.
const EVENT_DOTS: Record<DetailEventType, string> = {
  scheduled: "bg-muted ring-muted",
  draft_submitted: "bg-accent ring-accent",
  revision_requested: "bg-amber ring-amber",
  draft_approved: "bg-green ring-green",
  link_submitted: "bg-green ring-green",
};

const SECTION_LABEL = "mb-2 text-[11px] font-bold uppercase tracking-wider text-muted";

// One row of the timeline: the dot in a narrow first column, and a line drawn from under it
// to the next row, left off the last row.
const TIMELINE_ROW =
  "relative grid grid-cols-[13px_1fr] gap-3 pb-5 before:absolute before:bottom-0 before:left-[6px] before:top-4 before:w-px before:bg-rule last:pb-0 last:before:hidden";

// A filled disc with a gap and a ring of its own colour, so it reads as a marker on the line.
const DOT = "mt-[3px] size-[13px] rounded-full border-2 border-surface ring-[1.5px]";

/**
 * The note form opens from a click on Minta Revisi, so focus follows the admin into it.
 * Module-level so its identity is stable: React calls it once when the field mounts
 * rather than on every render, which would pull focus back from the form's own buttons.
 */
function focusOnMount(element: HTMLTextAreaElement | null) {
  element?.focus();
}

/**
 * Red once the deadline has passed, amber from the day before it, green when finished. A
 * pending proposal is not assigned work yet, so its deadline warns about nothing, the same
 * way it never carries the Overdue tag.
 */
function dueTone(status: ContentDetail["status"], days: number | null): string {
  if (status === "link_submitted") return "text-green-ink";
  if (status === "pending" || days === null) return "";
  if (days < 0) return "text-red-ink";
  return days <= DUE_SOON_DAYS ? "text-amber-ink" : "";
}

function HeaderMeta({ detail, now }: Readonly<{ detail: ContentDetail; now?: Date }>) {
  // A finished content has no countdown left, however its deadline compares to today. The
  // days are counted once, so the label and its colour can never disagree across midnight.
  const finished = detail.status === "link_submitted";
  const days = daysUntil(detail.deadline, now);
  // The API can name a status newer than this build: its raw name then, never a blank.
  const statusLabel: string = CONTENT_STATUS_LABELS[detail.status] ?? detail.status;

  return (
    <>
      <StatusDot tone="accent">{CONTENT_TYPE_LABELS[detail.type]}</StatusDot>

      <StatusDot tone={CONTENT_STATUS_TONES[detail.status] ?? "neutral"}>{statusLabel}</StatusDot>

      <ContentTags tags={detail.tags} />

      <span>
        Deadline <b className="font-semibold text-ink">{formatDate(detail.deadline)}</b> ·{" "}
        <span data-testid="deadline-due" className={`font-semibold ${dueTone(detail.status, days)}`}>
          {finished ? "Selesai" : formatDaysLeft(days)}
        </span>
      </span>
    </>
  );
}

function Brief({ brief }: Readonly<{ brief: string }>) {
  const [expanded, setExpanded] = useState(false);
  // By character, not by UTF-16 unit, so an emoji at the cut is kept whole or left out.
  const characters = Array.from(brief);
  const long = characters.length > BRIEF_PREVIEW_LENGTH;
  const shown =
    long && !expanded ? `${characters.slice(0, BRIEF_PREVIEW_LENGTH).join("")}…` : brief;

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

function JourneyItem({ step }: Readonly<{ step: JourneyStep }>) {
  const { event } = step;
  const role = ROLE_LABELS[event.actor.role];
  const link = event.payload?.link;

  return (
    <li className={TIMELINE_ROW}>
      <span aria-hidden="true" data-timeline-dot="" className={`${DOT} ${EVENT_DOTS[event.type]}`} />

      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold">
          <span data-step-title="">{step.title}</span>
          <time dateTime={event.at} className="text-[11.5px] font-normal text-muted">
            {formatTimestamp(event.at)}
          </time>
        </p>

        <p data-step-actor="" className="mt-0.5 text-[11.5px] text-muted">
          {event.actor.name ? `${event.actor.name} · ${role}` : role}
        </p>

        {link && step.linkLabel ? (
          <div className="mt-2">
            <CreatorLink link={link} label={step.linkLabel} look="chip" />
          </div>
        ) : null}

        {step.noteBy ? (
          <blockquote className="mt-2 rounded-r-(--radius-control) border-l-2 border-rule bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed">
            <span className="mb-0.5 block text-[11px] font-semibold text-muted">{step.noteBy}</span>
            <p className="whitespace-pre-line">{event.payload?.note}</p>
          </blockquote>
        ) : null}
      </div>
    </li>
  );
}

function Journey({ steps }: Readonly<{ steps: JourneyStep[] }>) {
  if (steps.length === 0) {
    return <p className="text-xs text-muted">Belum ada riwayat.</p>;
  }

  return (
    <ol aria-label="Riwayat konten">
      {steps.map((step) => (
        <JourneyItem key={step.event.id} step={step} />
      ))}
    </ol>
  );
}

/** The step the content is waiting on; the revision form and a refusal show inside it. */
function CurrentStep({
  status,
  waitingOn,
  role,
  children,
}: Readonly<{
  status: ContentDetail["status"];
  waitingOn: WaitingOn;
  role: Role;
  children?: ReactNode;
}>) {
  const tone = STEP_TONES[waitingOn ?? "done"];
  // Undefined for a status newer than this build, which then simply has no line of context.
  const text: string | undefined =
    (role === "admin" ? ADMIN_STEP_TEXT[status] : undefined) ?? STEP_TEXT[status];

  return (
    <div
      data-testid="current-step"
      className={`mb-5 rounded-(--radius-panel) border p-3.5 ${tone.card}`}
    >
      <p className={`text-[11px] font-bold uppercase tracking-wider ${tone.label}`}>
        {waitingOn === null ? "Selesai" : WAITING_LABELS[waitingOn]}
      </p>

      {text ? (
        <p data-testid="step-text" className="mt-1 text-[13px] text-ink-2">
          {text}
        </p>
      ) : null}

      {children}
    </div>
  );
}

function StatusMessage({
  state,
  onRetry,
}: Readonly<{ state: Exclude<LoadState, { kind: "loaded" }>; onRetry: () => void }>) {
  if (state.kind === "loading") {
    return (
      <p className="py-6 text-center text-[13px] text-muted">Memuat konten...</p>
    );
  }

  if (state.kind === "not_found") {
    return (
      <p className="py-6 text-center text-[13px] text-red-ink">Konten tidak ditemukan.</p>
    );
  }

  return <LoadError title="Detail konten gagal dimuat" onRetry={onRetry} />;
}

/**
 * The Content Detail panel: one view of a content item's journey and its next step,
 * opened from every touchpoint with the same content (PBI 6). It is a sheet docked to the
 * right: the header names the content, its type, status, tags and deadline; under it the
 * brief, the step it is waiting on, and the journey as a timeline. The step's actions are
 * the commands `actionsFor` chose for the caller's role; an `actions` slot replaces
 * them entirely when the touchpoint brings its own.
 *
 * A decision that goes through refreshes the page and reports upward through
 * `onDecided`; one that fails stays right here with the backend's reason and the
 * typed note, so the admin can retry without reopening anything.
 */
export function ContentDetailPanel({
  contentId,
  role,
  onClose,
  actions,
  onDecided,
  showClose = true,
  load = fetchContentDetail,
  ports = {},
  now,
}: Readonly<{
  contentId: string;
  role: Role;
  onClose: () => void;
  /** Replaces the role-based commands entirely, when the touchpoint brings its own. */
  actions?: ReactNode;
  /** Called after a successful decision, naming it, so the caller can close and confirm. */
  onDecided?: (decision: Decision) => void;
  /** False while the revision form offers its own way back (Batal). */
  showClose?: boolean;
  /** Where the detail comes from; the API by default, a stub in tests. */
  load?: ContentDetailLoader;
  ports?: PanelActionPorts;
  /** The moment "today" is read from; the current one by default, a fixed one in tests. */
  now?: Date;
}>) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [pending, setPending] = useState<Decision | null>(null);
  const [form, setForm] = useState<FormKind | null>(null);
  const formOpen = form !== null;
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Batal unmounts the textarea that held focus; the button that opened the form takes it back
  // when it remounts, so a keyboard user is not dropped to the top of the page.
  const [cancelled, setCancelled] = useState<FormKind | null>(null);
  const countId = useId();
  const busy = pending !== null;
  const [attempt, setAttempt] = useState(0);

  // Read through a ref, so a parent that passes a fresh loader function on every render does
  // not make the effect below fetch again each time.
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  }, [load]);

  // No reset on contentId here: the caller keys this component by content, so a
  // different item is a fresh mount starting from "loading".
  useEffect(() => {
    // Closing the panel or retrying cancels the request nobody is waiting for any more.
    const controller = new AbortController();

    loader
      .current(contentId, role, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted) setState({ kind: "loaded", detail });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        // A 400 is an id that cannot name any content (a mistyped or crafted ?content= link):
        // retrying cannot fix it, so it reads the same as one that names nothing.
        const notFound =
          caught instanceof ContentDetailError && (caught.status === 404 || caught.status === 400);
        setState({ kind: notFound ? "not_found" : "failed" });
      });

    return () => {
      controller.abort();
    };
  }, [contentId, role, attempt]);

  // A re-read after a refused decision runs beside the panel's own load; unmounting cancels it.
  const reread = useRef<AbortController | null>(null);
  useEffect(() => () => reread.current?.abort(), []);

  /**
   * Reads the content again without leaving it: the last answer stays on screen until the
   * new one arrives, and a failed re-read keeps it, since the refusal already said why.
   */
  async function readAgain() {
    reread.current?.abort();
    const controller = new AbortController();
    reread.current = controller;
    try {
      const detail = await loader.current(contentId, role, controller.signal);
      if (!controller.signal.aborted) setState({ kind: "loaded", detail });
    } catch {
      // The panel keeps what it showed; the refusal message is still the useful part.
    }
  }

  function retry() {
    setState({ kind: "loading" });
    setAttempt((count) => count + 1);
  }

  const loaded = state.kind === "loaded" ? state.detail : null;

  const actionPorts: PanelActionPorts = {
    approve: ports.approve ?? approveSubmission,
    revise: ports.revise ?? reviseSubmission,
    openRevisionForm: () => {
      setError(null);
      setForm("revise");
      ports.openRevisionForm?.();
    },
    approveProposal: ports.approveProposal ?? approveProposal,
    rejectProposal: ports.rejectProposal ?? rejectProposal,
    openRejectForm: () => {
      setError(null);
      setForm("reject");
      ports.openRejectForm?.();
    },
    onCreatorAction: ports.onCreatorAction,
  };

  const snapshot = () => ({ busy, note });

  async function decide(kind: Decision, run: () => Promise<void>) {
    setError(null);
    setPending(kind);

    try {
      await run();
      router.refresh();
      onDecided?.(kind);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Terjadi kesalahan. Coba lagi.");
      // A 409 means someone else already moved the content on: the step on screen is stale,
      // so the note form closes and the content is read again to show where it stands now.
      if (caught instanceof DraftReviewActionError && caught.status === 409) {
        setForm(null);
        setNote("");
        void readAgain();
      }
    } finally {
      setPending(null);
    }
  }

  const commands = loaded
    ? actions
        ? []
        : actionsFor({ role, detail: loaded, state: snapshot, ports: actionPorts })
    : [];
  // The open form's own send button: a revision needs a note, a rejection takes one if given.
  let send: PanelCommand | null = null;
  if (loaded && form === "revise") {
    send = submitRevision({
      submissionId: loaded.latestSubmissionId ?? "",
      state: snapshot,
      ports: actionPorts,
    });
  } else if (loaded && form === "reject") {
    send = submitRejection({ contentId: loaded.id, state: snapshot, ports: actionPorts });
  }
  const formSpec = form ? FORMS[form] : null;

  function cancelForm() {
    setCancelled(form);
    setForm(null);
    setError(null);
    setNote("");
  }

  return (
    <Modal
      title={(loaded && loaded.name) || DEFAULT_TITLE}
      onClose={onClose}
      placement="side"
      eyebrow={(loaded && loaded.creatorName) || undefined}
      meta={loaded ? <HeaderMeta detail={loaded} now={now} /> : undefined}
      footer={
        <>
          {formOpen ? null : actions}

          {formOpen ? null : commands.map((command) => (
            <Button
              key={command.kind}
              variant={command.variant}
              onClick={() => {
                if (OPENS_FORM.has(command.kind)) {
                  // Opening a form is synchronous, but PanelCommand.run may answer with a
                  // promise; `void` marks the ignored answer so no lint sees a floating
                  // promise (Sonar S9383).
                  void command.run();
                  return;
                }
                // Every command that does not open a form is a decision of the same name.
                void decide(command.kind as Decision, async () => {
                  await command.run();
                });
              }}
              disabled={!command.canRun()}
              aria-busy={busy && pending === command.kind}
              autoFocus={cancelled !== null && FORMS[cancelled].opener === command.kind}
            >
              {command.label}
            </Button>
          ))}

          {showClose && !formOpen ? (
            <Button variant="ghost" onClick={onClose}>
              Tutup
            </Button>
          ) : null}
        </>
      }
    >
      {loaded ? (
        <div className="flex flex-col gap-5">
          {/* Evergreen content has no brief. */}
          {loaded.type === "specific" && loaded.brief ? <Brief brief={loaded.brief} /> : null}

          <section>
            <h3 className={SECTION_LABEL}>Timeline</h3>

            <CurrentStep status={loaded.status} waitingOn={loaded.waitingOn} role={role}>
            {send && formSpec ? (
              <div className="mt-3 flex w-full flex-col gap-2">
                {error ? (
                  <p role="alert" className="text-right text-xs text-red-ink">
                    {error}
                  </p>
                ) : null}

                <label className="flex flex-col gap-1 text-[13px]">
                  <span className="font-semibold text-ink">{formSpec.label}</span>
                  <textarea
                    ref={focusOnMount}
                    required={formSpec.required}
                    maxLength={formSpec.max}
                    aria-describedby={countId}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder={formSpec.placeholder}
                    rows={3}
                    disabled={busy}
                    className="rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink"
                  />
                </label>
                <CharLimit id={countId} length={note.length} max={formSpec.max} />

                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={cancelForm} disabled={busy}>
                    Batal
                  </Button>
                  <Button
                    variant={send.variant}
                    onClick={() => {
                      void decide(formSpec.decision, async () => {
                        await send.run();
                      });
                    }}
                    disabled={!send.canRun()}
                    aria-busy={pending === formSpec.decision}
                  >
                    {send.label}
                  </Button>
                </div>
              </div>
            ) : error ? (
              <p role="alert" className="mt-2 text-xs text-red-ink">
                {error}
              </p>
            ) : null}
            </CurrentStep>

            <Journey steps={describeJourney(loaded.events)} />
          </section>
        </div>
      ) : (
        // This branch only renders while `loaded` is null, so the state is one of the
        // three that StatusMessage handles; the union cannot narrow itself through the
        // const above.
        <StatusMessage
          state={state as Exclude<LoadState, { kind: "loaded" }>}
          onRetry={retry}
        />
      )}
    </Modal>
  );
}
