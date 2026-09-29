"use client";

import { useId, useRef, useState } from "react";
import {
  DRAFT_LINK_NOT_DRIVE,
  isGoogleDriveLink,
  MAX_DRAFT_LINK_LENGTH,
} from "@/lib/draft-link";
import { submitDraft, type DraftSubmitter } from "@/lib/draft-submission";
import { CharLimit } from "@/components/ui/char-limit";
import { Modal } from "@/components/ui/modal";
import { useDiscardGuard } from "@/components/ui/use-discard-guard";
import { Button } from "@/components/ui/button";
import { FIELD, FIELD_ERROR, REQUIRED_MARK } from "@/components/ui/form-classes";
import type { MyTaskAction } from "@/lib/my-tasks";
import { TaskSummary, type TaskContent } from "./task-summary";

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
  content: TaskContent;

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
  const linkErrorId = useId();
  const linkHintId = useId();
  const notesErrorId = useId();
  const notesCountId = useId();
  const linkRef = useRef<HTMLInputElement>(null);

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

  // Checked on every change so a link from the wrong place is flagged as it is typed; an
  // empty field stays the required-message path on submit instead.
  const trimmedDraftLink = draftLink.trim();
  const notDrive = trimmedDraftLink !== "" && !isGoogleDriveLink(trimmedDraftLink);
  const shownLinkError = notDrive ? DRAFT_LINK_NOT_DRIVE : draftLinkError;

  const { requestClose, confirmDialog } = useDiscardGuard({
    isDirty: draftLink !== "" || adminNotes !== "",
    onDiscard: onClose,
    title: "Batalkan pengiriman draft?",
  });

  async function handleSubmit() {
    const trimmedLink = draftLink.trim();

    // Treat empty and whitespace-only links as invalid.
    if (!trimmedLink) {
      setDraftLinkError("Link file draft wajib diisi");
      linkRef.current?.focus();
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
    <>
    <Modal
      title={wording.title}
      onClose={isSubmitting ? () => undefined : requestClose}
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={requestClose}
            disabled={isSubmitting}
          >
            Batal
          </Button>

          <Button
            type="button"
            variant="accent"
            onClick={handleSubmit}
            disabled={isSubmitting || notDrive}
          >
            {isSubmitting ? "Mengirim..." : wording.submit}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TaskSummary content={content} />

        <label className="flex flex-col gap-1.5">
          <span className={`text-sm text-ink ${REQUIRED_MARK}`}>Link File Draft</span>

          <input
            ref={linkRef}
            type="url"
            required
            aria-label="Link File Draft"
            maxLength={MAX_DRAFT_LINK_LENGTH}
            placeholder="https://drive.google.com/file/d/…"
            aria-invalid={shownLinkError ? true : undefined}
            aria-describedby={shownLinkError ? linkErrorId : linkHintId}
            value={draftLink}
            onChange={(event) => {
              setDraftLink(event.target.value);
              // The message described the old value; a new one is checked again on submit.
              setDraftLinkError("");
            }}
            className={FIELD}
          />

          {/* Show a field-specific error directly below the draft link. */}
          {shownLinkError ? (
            <p id={linkErrorId} className={FIELD_ERROR}>
              {shownLinkError}
            </p>
          ) : (
            <p id={linkHintId} className="text-xs text-muted">
              Tempel link Google Drive yang bisa dibuka admin.
            </p>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink">
            Catatan untuk Admin (opsional)
          </span>

          <textarea
            aria-label="Catatan untuk Admin"
            aria-invalid={adminNotesError ? true : undefined}
            aria-describedby={adminNotesError ? `${notesErrorId} ${notesCountId}` : notesCountId}
            rows={3}
            maxLength={MAX_DRAFT_NOTES_LENGTH}
            value={adminNotes}
            onChange={(event) => {
              setAdminNotes(event.target.value);
              setAdminNotesError("");
            }}
            className={`resize-y ${FIELD}`}
          />

          <CharLimit id={notesCountId} length={adminNotes.length} max={MAX_DRAFT_NOTES_LENGTH} />

          {adminNotesError ? (
            <p id={notesErrorId} className={FIELD_ERROR}>
              {adminNotesError}
            </p>
          ) : null}
        </label>

        {/* General failures are announced to assistive technology as an alert. */}
        {submissionError ? (
          <p role="alert" className={FIELD_ERROR}>
            {submissionError}
          </p>
        ) : null}
      </div>
    </Modal>
    {confirmDialog}
    </>
  );
}
