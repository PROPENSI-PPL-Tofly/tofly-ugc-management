"use client";

import { useState } from "react";
import {
  isSupportedVideoLink,
  submitVideo,
  type VideoSubmitter,
} from "@/lib/video-submission";
import { Modal } from "@/components/ui/modal";

// Wording matches the backend's INVALID_VIDEO_LINK message so both layers read
// the same sentence.
const PLATFORM_ERROR = "Link harus berupa URL Instagram atau TikTok";

export interface SubmitVideoModalProps {
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
  submitVideoAction?: VideoSubmitter;
}

export function SubmitVideoModal({
  content,
  onClose,
  onSubmitted,
  submitVideoAction = submitVideo,
}: SubmitVideoModalProps) {
  // Stores the current value of the video link field.
  const [videoLink, setVideoLink] = useState("");

  // Stores a validation message specifically for the video link.
  const [videoLinkError, setVideoLinkError] = useState("");

  // Stores an error that applies to the whole submission.
  const [submissionError, setSubmissionError] = useState("");

  // Tracks whether a video submission is currently in progress.
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedLink = videoLink.trim();

  // Checked on every change so a wrong platform is flagged as it is typed.
  // Empty input stays the required-message path on submit instead.
  const hasPlatformError =
    trimmedLink !== "" && !isSupportedVideoLink(trimmedLink);

  const shownLinkError = hasPlatformError
    ? PLATFORM_ERROR
    : videoLinkError;

  async function handleSubmit() {
    // Treat empty and whitespace-only links as invalid.
    if (!trimmedLink) {
      setVideoLinkError("Link video wajib diisi");
      return;
    }

    // Clear old errors before starting a new submission attempt.
    setVideoLinkError("");
    setSubmissionError("");

    // Lock the submit action while waiting for the request.
    setIsSubmitting(true);

    try {
      const result = await submitVideoAction(content.id, {
        link: trimmedLink,
      });

      // Notify the parent and close only after a successful submission.
      if (result.ok) {
        onSubmitted();
        onClose();
        return;
      }

      // Show a field-specific error beside the video link when available.
      if (result.errors?.videoLink) {
        setVideoLinkError(result.errors.videoLink);
        return;
      }

      // Other failures are shown as a general submission error.
      setSubmissionError(result.message);
    } finally {
      // Always unlock the action after the request finishes.
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      title="Submit Link Video"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-(--radius-control) px-4 py-2 text-sm text-muted hover:text-ink"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || hasPlatformError}
            className="cursor-pointer rounded-(--radius-control) bg-ink px-4 py-2 text-sm text-surface disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Mengirim..." : "Kirim Link"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Display the selected content without allowing it to be edited. */}
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm text-muted">
              Nama Konten
            </p>

            <p className="text-sm text-ink">
              {content.name}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted">
              Deadline
            </p>

            <p className="text-sm text-ink">
              {content.deadline}
            </p>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink">
            Link Video *
          </span>

          <input
            type="url"
            required
            aria-label="Link Video"
            value={videoLink}
            onChange={(event) => {
              setVideoLink(event.target.value);
              // A stored message is stale once the value changes; the live
              // platform check re-evaluates for the new value.
              setVideoLinkError("");
            }}
            className="rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-sm text-ink"
          />

          {/* Show a field-specific error directly below the video link. */}
          {shownLinkError ? (
            <p className="text-sm text-red-600">
              {shownLinkError}
            </p>
          ) : null}
        </label>

        {/* General failures are announced to assistive technology as an alert. */}
        {submissionError ? (
          <p
            role="alert"
            className="text-sm text-red-600"
          >
            {submissionError}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
