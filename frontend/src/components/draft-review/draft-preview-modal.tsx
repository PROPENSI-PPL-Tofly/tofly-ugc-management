"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusDot } from "@/components/ui/pill";
import type { ContentType } from "@/lib/contents";
import type { ContentStatus } from "@/lib/creators";
import {
  DraftPreviewError,
  fetchDraftPreview,
  type DraftPreview,
  type DraftRevision,
} from "@/lib/draft-preview";
import { EMPTY, formatDate, formatTimestamp } from "@/lib/format";
import { safeHref } from "@/lib/safe-href";

const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  scheduled: "Scheduled",
  draft_review: "Draft Menunggu Review",
  draft_revision: "Draft Perlu Revisi",
  draft_revised: "Draft Revised",
  draft_approved: "Draft Approved",
  link_submitted: "Content Link Submitted",
};

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  evergreen: "Evergreen",
  specific: "Specific",
};

/** Shown in the header until there is a content name to show instead. */
const DEFAULT_TITLE = "Preview Draft";

// One state at a time: a loaded preview and an error can never be on screen together.
type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; preview: DraftPreview }
  | { kind: "not_found" }
  | { kind: "failed" };

function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div>
      <p className="mb-1 text-[12.5px] font-semibold">{label}</p>
      <div className="text-[13px]">{children}</div>
    </div>
  );
}

/**
 * A creator-typed link: clickable only when it is a web address. Anything else is shown as
 * text, so the admin can still see what was sent without a click being able to run it.
 */
function CreatorLink({ link, label }: Readonly<{ link: string; label: string }>) {
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
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-accent-deep underline underline-offset-2"
    >
      {label}
    </a>
  );
}

function RevisionNote({ revision }: Readonly<{ revision: DraftRevision }>) {
  if (revision.note) {
    return (
      <>
        <p className="mt-1.5 text-xs font-semibold">Catatan revisi</p>
        <p className="whitespace-pre-line">{revision.note}</p>
      </>
    );
  }

  return (
    <p className="mt-1.5 text-muted">
      {revision.isCurrent ? "Menunggu review" : "Tanpa catatan revisi"}
    </p>
  );
}

function RevisionHistory({ revisions }: Readonly<{ revisions: DraftRevision[] }>) {
  if (revisions.length === 0) {
    return <p className="text-xs text-muted">Belum ada riwayat draft.</p>;
  }

  return (
    <ol aria-label="Riwayat draft" className="flex flex-col">
      {revisions.map((revision, index) => {
        const number = index + 1;

        return (
          <li
            key={revision.submissionId}
            className="border-b border-dashed border-rule-2 py-2 text-xs last:border-none"
          >
            <p className="flex flex-wrap justify-between gap-2">
              <span className="font-semibold">Draft ke-{number}</span>
              <span className="text-muted">{formatTimestamp(revision.submittedAt)}</span>
            </p>

            <CreatorLink link={revision.link} label={`Lihat draft ke-${number}`} />

            <RevisionNote revision={revision} />
          </li>
        );
      })}
    </ol>
  );
}

function PreviewBody({ preview }: Readonly<{ preview: DraftPreview }>) {
  return (
    <>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Creator">{preview.creatorName}</Field>

        <Field label="Deadline">{formatDate(preview.deadline)}</Field>

        <Field label="Tipe konten">
          <StatusDot tone="accent">{CONTENT_TYPE_LABELS[preview.type]}</StatusDot>
        </Field>

        <Field label="Status saat ini">
          <StatusDot>{CONTENT_STATUS_LABELS[preview.status]}</StatusDot>
        </Field>
      </div>

      {preview.type === "specific" ? (
        <Field label="Brief">
          <p className="whitespace-pre-line">{preview.brief || EMPTY}</p>
        </Field>
      ) : null}

      <Field label="File draft">
        <CreatorLink link={preview.draftLink} label="Buka file draft" />
      </Field>

      <Field label="Riwayat draft">
        <RevisionHistory revisions={preview.revisions} />
      </Field>
    </>
  );
}

function StatusMessage({ state }: Readonly<{ state: Exclude<LoadState, { kind: "loaded" }> }>) {
  if (state.kind === "loading") {
    return <p className="py-6 text-center text-[13px] text-muted">Memuat draft...</p>;
  }

  return (
    <p className="py-6 text-center text-[13px] text-red-ink">
      {state.kind === "not_found"
        ? "Draft tidak ditemukan."
        : "Gagal memuat draft. Coba tutup dan buka lagi."}
    </p>
  );
}

/**
 * The Draft Review "Lihat Detail" modal: everything an admin needs before deciding on a
 * draft. The decision itself is not this component's: Approve and Minta Revisi (SCRUM-129)
 * come in through `actions`, shown only once there is a loaded draft to decide on.
 */
export function DraftPreviewModal({
  submissionId,
  onClose,
  actions,
  load = fetchDraftPreview,
}: Readonly<{
  submissionId: string;
  onClose: () => void;
  actions?: ReactNode;
  /** Where the preview comes from; the API by default, a stub in tests. */
  load?: (submissionId: string) => Promise<DraftPreview>;
}>) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  // No reset on submissionId here: like the creator detail, the caller keys this component
  // by submission, so a different draft is a fresh mount starting from "loading".
  useEffect(() => {
    let cancelled = false;

    load(submissionId)
      .then((preview) => {
        if (!cancelled) setState({ kind: "loaded", preview });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const notFound = error instanceof DraftPreviewError && error.status === 404;
        setState({ kind: notFound ? "not_found" : "failed" });
      });

    return () => {
      cancelled = true;
    };
  }, [load, submissionId]);

  const loaded = state.kind === "loaded";

  return (
    <Modal
      title={loaded ? state.preview.contentName : DEFAULT_TITLE}
      onClose={onClose}
      footer={
        <>
          {loaded ? actions : null}

          <Button variant="ghost" onClick={onClose}>
            Tutup
          </Button>
        </>
      }
    >
      {loaded ? <PreviewBody preview={state.preview} /> : <StatusMessage state={state} />}
    </Modal>
  );
}
