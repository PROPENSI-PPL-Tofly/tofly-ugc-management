"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CharLimit } from "@/components/ui/char-limit";
import { REQUIRED_MARK } from "@/components/ui/form-classes";
import {
  approveSubmission,
  reviseSubmission,
} from "@/lib/draft-review-actions";

/** The API's limit on a revision note (backend revise-submission.ts). */
export const MAX_REVISION_NOTE_LENGTH = 1000;

/**
 * The note form opens from a click on Minta Revisi, so focus follows the admin into it.
 * Module-level so its identity is stable: React calls it once when the field mounts rather
 * than on every render, which would pull focus back from the form's own buttons.
 */
function focusOnMount(element: HTMLTextAreaElement | null) {
  element?.focus();
}

/**
 * The decision half of the Draft Preview (SCRUM-129): Approve sends the draft on,
 * Minta Revisi sends it back with a note. This is what the modal's `actions` slot
 * is for, so it only ever appears once a draft has loaded.
 *
 * A decision that goes through refreshes the queue and reports upward through
 * `onDecided`, which closes the modal; a decision that fails stays right here with
 * the backend's reason, so the admin can retry without reopening anything.
 */
export function ReviewActions({
  submissionId,
  onDecided,
  onFormToggle,
}: Readonly<{
  submissionId: string;
  /** Called after a successful decision, so the caller can close the modal. */
  onDecided: () => void;
  /** Called when the revision note form opens or closes, so the modal can drop Tutup meanwhile. */
  onFormToggle?: (open: boolean) => void;
}>) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "revise" | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = pending !== null;
  // Batal unmounts the textarea that held focus; Minta Revisi takes it back when it remounts,
  // so a keyboard user is not dropped to the top of the page.
  const [cancelled, setCancelled] = useState(false);
  const countId = useId();
  // A note of only spaces says nothing to the creator, so it does not count as written.
  const noteWritten = note.trim() !== "";

  async function decide(kind: "approve" | "revise", run: () => Promise<void>) {
    setError(null);
    setPending(kind);

    try {
      await run();
      router.refresh();
      onDecided();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setPending(null);
    }
  }

  function approve() {
    return decide("approve", () => approveSubmission(submissionId));
  }

  function submitNote() {
    return decide("revise", () => reviseSubmission(submissionId, note.trim()));
  }

  function openForm() {
    setError(null);
    setFormOpen(true);
    onFormToggle?.(true);
  }

  function cancelForm() {
    setFormOpen(false);
    onFormToggle?.(false);
    setError(null);
    setNote("");
    setCancelled(true);
  }

  if (formOpen) {
    return (
      <div className="flex w-full flex-col gap-2">
        {error ? (
          <p role="alert" className="text-right text-xs text-red-ink">
            {error}
          </p>
        ) : null}

        <label className="flex flex-col gap-1 text-[13px]">
          <span className={`font-semibold text-ink ${REQUIRED_MARK}`}>
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
            variant="accent"
            onClick={submitNote}
            disabled={busy || !noteWritten}
            aria-busy={busy}
          >
            Kirim Revisi
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {error ? (
        <p role="alert" className="mr-auto text-xs text-red-ink">
          {error}
        </p>
      ) : null}

      <Button variant="default" onClick={openForm} disabled={busy} autoFocus={cancelled}>
        Minta Revisi
      </Button>
      <Button
        variant="accent"
        onClick={approve}
        disabled={busy}
        aria-busy={pending === "approve"}
      >
        Approve
      </Button>
    </>
  );
}
