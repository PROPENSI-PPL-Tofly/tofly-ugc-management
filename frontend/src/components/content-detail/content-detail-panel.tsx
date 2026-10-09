"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CharLimit } from "@/components/ui/char-limit";
import { DetailField } from "@/components/ui/detail-field";
import { Modal } from "@/components/ui/modal";
import { Pill, StatusDot } from "@/components/ui/pill";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_TONES,
  CONTENT_TYPE_LABELS,
} from "@/lib/content-labels";
import {
  ContentDetailError,
  dueLabel,
  fetchContentDetail,
  type ContentDetail,
  type ContentDetailLoader,
  type DetailEventType,
  type RawContentEvent,
} from "@/lib/content-detail";
import { approveSubmission, reviseSubmission } from "@/lib/draft-review-actions";
import { EMPTY, formatDate, formatTimestamp } from "@/lib/format";
import {
  actionsFor,
  submitRevision,
  type PanelActionPorts,
} from "@/lib/panel-actions";
import type { Role } from "@/lib/session";
import { safeHref } from "@/lib/safe-href";

/** The API's limit on a revision note (backend revise-submission.ts). */
export const MAX_REVISION_NOTE_LENGTH = 1000;

/** Shown in the header until there is a content name to show instead. */
const DEFAULT_TITLE = "Detail Konten";

// One state at a time: a loaded detail and an error can never be on screen together.
type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; detail: ContentDetail }
  | { kind: "not_found" }
  | { kind: "failed" };

/** The step's waiting side reads the same however the status spells it. */
const WAITING_LABELS: Record<"admin" | "creator", string> = {
  admin: "Menunggu Admin",
  creator: "Menunggu kreator",
};

/** One line of context under the waiting side, per status. */
const STEP_TEXT: Record<ContentDetail["status"], string> = {
  scheduled: "Kreator belum kirim draft.",
  draft_review: "Draft sedang ditinjau Admin.",
  draft_revision: "Menunggu draft revisi dari kreator.",
  draft_revised: "Draft ulangan sedang ditinjau Admin.",
  draft_approved: "Menunggu link video final.",
  link_submitted: "Link video sudah dikirim.",
};

const EVENT_TITLES: Record<DetailEventType, (event: RawContentEvent) => string> = {
  scheduled: () => "Ditambahkan Admin",
  draft_submitted: (event) => `Draft v${event.payload?.version ?? "?"} dikirim`,
  revision_requested: () => "Minta revisi",
  draft_approved: () => "Draft di-approve",
  link_submitted: () => "Link video dikirim",
};

/** Today where the deadlines count from, as the ISO day the API sends. */
function jakartaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
    new Date(),
  );
}

/**
 * The note form opens from a click on Minta Revisi, so focus follows the admin into it.
 * Module-level so its identity is stable: React calls it once when the field mounts
 * rather than on every render, which would pull focus back from the form's own buttons.
 */
function focusOnMount(element: HTMLTextAreaElement | null) {
  element?.focus();
}

function CreatorOrSystemLink({ link, label }: Readonly<{ link: string; label: string }>) {
  const href = safeHref(link);

  if (!href) {
    return (
      <>
        <span className="break-all">{link}</span>
        <p className="mt-1 text-xs text-red-ink">
          Link ini bukan link web yang valid, jadi tidak bisa dibuka.
        </p>
      </>
    );
  }

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-accent-deep underline underline-offset-2"
      >
        {label}
      </a>
      <p className="mt-1 break-all text-xs text-muted">{href}</p>
    </>
  );
}

function Journey({ events }: Readonly<{ events: RawContentEvent[] }>) {
  if (events.length === 0) {
    return <p className="text-xs text-muted">Belum ada riwayat.</p>;
  }

  return (
    <ol aria-label="Riwayat konten" className="flex flex-col">
      {events.map((event) => (
        <li
          key={event.id}
          className="border-b border-dashed border-rule-2 py-2 text-xs last:border-none"
        >
          <p className="flex flex-wrap justify-between gap-2">
            <span className="font-semibold">{EVENT_TITLES[event.type](event)}</span>
            <span className="text-muted">{formatTimestamp(event.at)}</span>
          </p>

          {event.payload?.note ? (
            <p className="mt-1.5 whitespace-pre-line">
              <span className="font-semibold">Catatan Admin: </span>
              {event.payload.note}
            </p>
          ) : null}

          {event.payload?.link ? (
            <div className="mt-1.5">
              <CreatorOrSystemLink link={event.payload.link} label="Buka file" />
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function DetailBody({
  detail,
  today,
}: Readonly<{ detail: ContentDetail; today: string }>) {
  return (
    <>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <DetailField label="Creator">{detail.creatorName || EMPTY}</DetailField>

        <DetailField label="Tipe konten">
          <StatusDot tone="accent">{CONTENT_TYPE_LABELS[detail.type]}</StatusDot>
        </DetailField>

        <DetailField label="Status saat ini">
          <span className="flex flex-wrap items-center gap-2">
            <StatusDot tone={CONTENT_STATUS_TONES[detail.status]}>
              {CONTENT_STATUS_LABELS[detail.status]}
            </StatusDot>
            {detail.tags.overdue ? <Pill tone="red">Overdue</Pill> : null}
            {detail.tags.lateSubmission ? (
              <Pill tone="red">Late Submission</Pill>
            ) : null}
            {detail.tags.approvalBypassed ? (
              <Pill tone="amber">Approval di-bypass</Pill>
            ) : null}
          </span>
        </DetailField>

        <DetailField label="Deadline">
          {formatDate(detail.deadline)} ·{" "}
          {dueLabel(detail.status, detail.deadline, today)}
        </DetailField>
      </div>

      {/* Evergreen content has no brief. */}
      {detail.type === "evergreen" ? null : (
        <DetailField label="Brief">
          <p className="whitespace-pre-line">{detail.brief || EMPTY}</p>
        </DetailField>
      )}

      <DetailField label="Riwayat konten">
        <Journey events={detail.events} />
      </DetailField>
    </>
  );
}

function StatusMessage({
  state,
}: Readonly<{ state: Exclude<LoadState, { kind: "loaded" }> }>) {
  if (state.kind === "loading") {
    return (
      <p className="py-6 text-center text-[13px] text-muted">Memuat konten...</p>
    );
  }

  return (
    <p className="py-6 text-center text-[13px] text-red-ink">
      {state.kind === "not_found"
        ? "Konten tidak ditemukan."
        : "Gagal memuat konten. Coba tutup dan buka lagi."}
    </p>
  );
}

/**
 * The Content Detail panel: one view of a content item's journey and its next step,
 * opened from every touchpoint with the same content (PBI 6). The step's actions are
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
}: Readonly<{
  contentId: string;
  role: Role;
  onClose: () => void;
  /** Replaces the role-based commands entirely, when the touchpoint brings its own. */
  actions?: ReactNode;
  /** Called after a successful decision, so the caller can close the panel. */
  onDecided?: () => void;
  /** False while the revision form offers its own way back (Batal). */
  showClose?: boolean;
  /** Where the detail comes from; the API by default, a stub in tests. */
  load?: ContentDetailLoader;
  ports?: PanelActionPorts;
}>) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [pending, setPending] = useState<"approve" | "revise" | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Batal unmounts the textarea that held focus; Minta Revisi takes it back when it
  // remounts, so a keyboard user is not dropped to the top of the page.
  const [cancelled, setCancelled] = useState(false);
  const countId = useId();
  const busy = pending !== null;
  const today = jakartaToday();

  // No reset on contentId here: the caller keys this component by content, so a
  // different item is a fresh mount starting from "loading".
  useEffect(() => {
    let cancelledLoad = false;

    load(contentId, role)
      .then((detail) => {
        if (!cancelledLoad) setState({ kind: "loaded", detail });
      })
      .catch((caught: unknown) => {
        if (cancelledLoad) return;
        const notFound =
          caught instanceof ContentDetailError && caught.status === 404;
        setState({ kind: notFound ? "not_found" : "failed" });
      });

    return () => {
      cancelledLoad = true;
    };
  }, [contentId, load, role]);

  const loaded = state.kind === "loaded" ? state.detail : null;

  const actionPorts: PanelActionPorts = {
    approve: ports.approve ?? approveSubmission,
    revise: ports.revise ?? reviseSubmission,
    openRevisionForm: () => {
      setError(null);
      setFormOpen(true);
      ports.openRevisionForm?.();
    },
    onCreatorAction: ports.onCreatorAction,
  };

  const snapshot = () => ({ busy, note });

  async function decide(kind: "approve" | "revise", run: () => Promise<void>) {
    setError(null);
    setPending(kind);

    try {
      await run();
      router.refresh();
      onDecided?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setPending(null);
    }
  }

  const commands = loaded
    ? actions
        ? []
        : actionsFor({ role, detail: loaded, state: snapshot, ports: actionPorts })
    : [];
  const kirim = loaded
    ? submitRevision({
        submissionId: loaded.latestSubmissionId ?? "",
        state: snapshot,
        ports: actionPorts,
      })
    : null;

  function cancelForm() {
    setFormOpen(false);
    setError(null);
    setNote("");
    setCancelled(true);
  }

  return (
    <Modal
      title={(loaded && loaded.name) || DEFAULT_TITLE}
      onClose={onClose}
      footer={
        <>
          {formOpen ? null : actions}

          {formOpen ? null : commands.map((command) => (
            <Button
              key={command.kind}
              variant={command.variant}
              onClick={() => {
                if (command.kind === "revise") {
                  command.run();
                  return;
                }
                void decide("approve", async () => {
                  await command.run();
                });
              }}
              disabled={!command.canRun()}
              aria-busy={busy && pending === command.kind}
              autoFocus={cancelled && command.kind === "revise"}
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
        <>
          <DetailBody detail={loaded} today={today} />

          <div className="rounded-(--radius-control) border border-rule bg-surface-2 p-3.5">
            <p className="text-[12.5px] font-semibold">
              {loaded.waitingOn === null
                ? "Selesai"
                : WAITING_LABELS[loaded.waitingOn]}
            </p>
            <p className="mt-1 text-[13px] text-ink-2">
              {STEP_TEXT[loaded.status]}
            </p>

            {formOpen && kirim ? (
              <div className="mt-3 flex w-full flex-col gap-2">
                {error ? (
                  <p role="alert" className="text-right text-xs text-red-ink">
                    {error}
                  </p>
                ) : null}

                <label className="flex flex-col gap-1 text-[13px]">
                  <span className="font-semibold text-ink">
                    Catatan revisi untuk creator
                  </span>
                  <textarea
                    ref={focusOnMount}
                    required
                    maxLength={MAX_REVISION_NOTE_LENGTH}
                    aria-describedby={countId}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="mis. Warna kurang kontras, mohon perbaiki bagian intro..."
                    rows={3}
                    disabled={busy}
                    className="rounded-(--radius-control) border border-rule bg-surface px-3 py-1.5 text-[13px] text-ink"
                  />
                </label>
                <CharLimit id={countId} length={note.length} max={MAX_REVISION_NOTE_LENGTH} />

                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={cancelForm} disabled={busy}>
                    Batal
                  </Button>
                  <Button
                    variant={kirim.variant}
                    onClick={() => {
                      void decide("revise", async () => {
                        await kirim.run();
                      });
                    }}
                    disabled={!kirim.canRun()}
                    aria-busy={pending === "revise"}
                  >
                    {kirim.label}
                  </Button>
                </div>
              </div>
            ) : error ? (
              <p role="alert" className="mt-2 text-xs text-red-ink">
                {error}
              </p>
            ) : null}
          </div>
        </>
      ) : (
        // This branch only renders while `loaded` is null, so the state is one of the
        // three that StatusMessage handles; the union cannot narrow itself through the
        // const above.
        <StatusMessage
          state={state as Exclude<LoadState, { kind: "loaded" }>}
        />
      )}
    </Modal>
  );
}
