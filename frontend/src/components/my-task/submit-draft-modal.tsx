"use client";

import { useState } from "react";
import { submitDraft, type DraftSubmitter } from "@/lib/draft-submission";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { MyTaskAction } from "@/lib/my-tasks";

const MAX_DRAFT_NOTES_LENGTH = 1000;

/** The two Task Saya actions this modal serves. */
export type DraftAction = Extract<MyTaskAction, "submit_draft" | "resubmit_draft">;

// One modal for both actions (PRD 3.16); only its wording follows the action picked.
const WORDING: Record<DraftAction, { title: string; submit: string }> = {
  submit_draft: { title: "Submit Draft", submit: "Kirim Draft" },
  resubmit_draft: { title: "Resubmit Draft", submit: "Kirim Ulang Draft" },
};

export interface SubmitDraftModalProps {
  // The content selected by the creator.
  content: {
    id: string;
    name: string;
    deadline: string;
  };

  // Lets the parent component control when the modal closes.
  onClose: () => void;

  // Lets the parent refresh its data after a successful submission.
  onSubmitted: () => void;

  // Allows the submission behavior to be replaced during testing.
  submitDraftAction?: DraftSubmitter;

  // Which Task Saya button opened the modal; decides its title and submit label.
  action?: DraftAction;
}

export function SubmitDraftModal({
  content,
  onClose,
  onSubmitted,
  submitDraftAction = submitDraft,
  action = "submit_draft",
}: SubmitDraftModalProps) {
  const wording = WORDING[action];

  // Stores the current value of the draft link field.
  const [draftLink, setDraftLink] = useState("");

  // Stores the optional note written for the admin.
  const [adminNotes, setAdminNotes] = useState("");

  // Stores a validation message specifically for the draft link.
  const [draftLinkError, setDraftLinkError] = useState("");

  // Stores a validation message specifically for the admin notes.
  const [adminNotesError, setAdminNotesError] = useState("");

  // Stores an error that applies to the whole submission.
  const [submissionError, setSubmissionError] = useState("");

  // Tracks whether a draft submission is currently in progress.
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    const trimmedLink = draftLink.trim();

    // Treat empty and whitespace-only links as invalid.
    if (!trimmedLink) {
      setDraftLinkError("Link file draft wajib diisi");
      return;
    }

    // Clear old errors before starting a new submission attempt.
    setDraftLinkError("");
    setAdminNotesError("");
    setSubmissionError("");

    const trimmedNotes = adminNotes.trim();

    // Lock the submit action while waiting for the request.
    setIsSubmitting(true);

    try {
      const result = await submitDraftAction(content.id, {
        link: trimmedLink,
        notes: trimmedNotes || null,
      });

      // Notify the parent and close only after a successful submission.
      if (result.ok) {
        onSubmitted();
        onClose();
        return;
      }

      if (result.errors?.link || result.errors?.notes) {
        setDraftLinkError(result.errors.link ?? "");
        setAdminNotesError(result.errors.notes ?? "");
        return;
      }

      setSubmissionError(result.message);
    } finally {
      // Always unlock the action after the request finishes.
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      title={wording.title}
      onClose={onClose}
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Batal
          </Button>

          <Button
            type="button"
            variant="accent"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Mengirim..." : wording.submit}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Display the selected content without allowing it to be edited. */}
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm text-muted">Nama Konten</p>

            <p className="text-sm text-ink">{content.name}</p>
          </div>

          <div>
            <p className="text-sm text-muted">Deadline</p>

            <p className="text-sm text-ink">{formatDate(content.deadline)}</p>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink">Link File Draft</span>

          <input
            type="url"
            required
            aria-label="Link File Draft"
            value={draftLink}
            onChange={(event) => {
              setDraftLink(event.target.value);
            }}
            className="rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-sm text-ink"
          />

          {/* Show a field-specific error directly below the draft link. */}
          {draftLinkError ? (
            <p className="text-sm text-red-ink">{draftLinkError}</p>
          ) : null}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink">
            Catatan untuk Admin (opsional)
          </span>

          <textarea
            aria-label="Catatan untuk Admin"
            rows={3}
            maxLength={MAX_DRAFT_NOTES_LENGTH}
            value={adminNotes}
            onChange={(event) => {
              setAdminNotes(event.target.value);
              setAdminNotesError("");
            }}
            className="resize-y rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-sm text-ink"
          />

          {adminNotesError ? (
            <p className="text-sm text-red-ink">{adminNotesError}</p>
          ) : null}
        </label>

        {/* General failures are announced to assistive technology as an alert. */}
        {submissionError ? (
          <p role="alert" className="text-sm text-red-ink">
            {submissionError}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
