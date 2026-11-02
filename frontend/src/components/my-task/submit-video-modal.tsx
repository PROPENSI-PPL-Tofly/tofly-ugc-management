"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FIELD, FIELD_ERROR } from "@/components/ui/form-classes";
import { Modal } from "@/components/ui/modal";
import { useDiscardGuard } from "@/components/ui/use-discard-guard";
import {
  canSendLinks,
  draftFromLinks,
  isLinkDraftDirty,
  linkChanges,
  linkProblems,
  PLATFORM_LABELS,
  VIDEO_PLATFORMS,
  type LinkChanges,
  type LinkDraft,
  type LinkProblems,
  type SentLink,
  type VideoPlatform,
} from "@/lib/video-links";
import { saveVideoLinks, type VideoLinksSaver } from "@/lib/video-links-api";
import { TaskSummary, type TaskContent } from "./task-summary";

export interface SubmitVideoModalProps {
  // The content selected by the creator.
  content: TaskContent;

  // The platforms a link may be added for (AC 3). Both for a creator, until the API names the
  // accounts on file; none for an admin, who can only replace a sent link.
  platforms?: readonly VideoPlatform[];

  // The links the content already has: given, the modal adds or replaces instead (AC 8, 9).
  links?: readonly SentLink[];

  // Lets the parent component control when the modal closes.
  onClose: () => void;

  // Lets the parent refresh its data after a successful save.
  onSubmitted: () => void;

  // Lets the parent refresh its data when a save went through only in part and the modal stays.
  onPartlySaved?: () => void;

  // Allows the save behavior to be replaced during testing.
  saveLinksAction?: VideoLinksSaver;
}

/**
 * What the confirmation says the save will do. A first link sets the content's status and its
 * submitted date (AC 7); a later one never moves that date (AC 8), and a replaced link loses its
 * performance numbers (AC 9).
 */
function confirmation(firstLink: boolean, { added, replaced }: LinkChanges) {
  if (firstLink) {
    return {
      title: "Kirim link video?",
      message:
        "Konten akan berstatus Link Dikirim. Tanggal link pertama dipakai sebagai tanggal pengiriman.",
    };
  }

  const steps = [
    ...added.map(({ platform }) => `Link ${PLATFORM_LABELS[platform]} ditambahkan.`),
    ...replaced.map(
      ({ platform }) => `Link ${PLATFORM_LABELS[platform]} diganti. Angka performa link lama dihapus.`,
    ),
  ];
  return {
    title: "Simpan link video?",
    message: `${steps.join(" ")} Tanggal pengiriman konten tidak berubah.`,
  };
}

export function SubmitVideoModal({
  content,
  platforms = VIDEO_PLATFORMS,
  links = [],
  onClose,
  onSubmitted,
  onPartlySaved,
  saveLinksAction = saveVideoLinks,
}: SubmitVideoModalProps) {
  // The links the server holds: those the modal opened with, plus any a partial save added.
  const [sent, setSent] = useState<LinkDraft>(() => draftFromLinks(links));

  // A sent link keeps its field even if its platform is no longer on file, so it can be replaced.
  const shown = VIDEO_PLATFORMS.filter(
    (platform) => platforms.includes(platform) || sent[platform] !== "",
  );

  // Stores the current value of every platform's field.
  const [draft, setDraft] = useState<LinkDraft>(sent);

  // Stores the server's message per field; each goes stale once its field is edited.
  const [serverErrors, setServerErrors] = useState<LinkProblems>({});

  // Stores an error that applies to the whole save.
  const [submissionError, setSubmissionError] = useState("");

  // Tracks whether the confirmation is open, and whether a save is in progress.
  const [confirming, setConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Checked on every change so a wrong link is flagged in its own field as it is typed.
  const problems = linkProblems(shown, draft, sent);
  const changes = linkChanges(shown, sent, draft);
  const firstLink = links.length === 0 && VIDEO_PLATFORMS.every((platform) => sent[platform] === "");

  const { requestClose, confirmDialog } = useDiscardGuard({
    isDirty: isLinkDraftDirty(sent, draft),
    onDiscard: onClose,
    title: "Batalkan pengiriman link video?",
  });

  const cannotSend =
    isSubmitting || Object.keys(serverErrors).length > 0 || !canSendLinks(shown, draft, sent);

  function change(platform: VideoPlatform, value: string) {
    setDraft((current) => ({ ...current, [platform]: value }));
    // A stored message is stale once its value changes; the live check re-evaluates the field.
    setServerErrors((current) => {
      const rest = { ...current };
      delete rest[platform];
      return rest;
    });
  }

  async function handleSubmit() {
    setConfirming(false);
    // Clear the old general error before starting a new attempt.
    setSubmissionError("");

    // Lock the form while waiting for the request.
    setIsSubmitting(true);

    try {
      const result = await saveLinksAction(content.id, changes);

      // Notify the parent and close only after a successful save.
      if (result.ok) {
        onSubmitted();
        onClose();
        return;
      }

      // What went through stays through: the next attempt starts from it.
      if (result.saved) {
        const saved = draftFromLinks(result.saved);
        setSent((current) => ({
          instagram: saved.instagram || current.instagram,
          tiktok: saved.tiktok || current.tiktok,
        }));
        onPartlySaved?.();
      }

      // Show field-specific errors beside their fields when the server names them.
      if (result.errors) {
        setServerErrors(result.errors);
        return;
      }

      // Other failures are shown as a general submission error.
      setSubmissionError(result.message);
    } finally {
      // Always unlock the form after the request finishes.
      setIsSubmitting(false);
    }
  }

  const question = confirmation(firstLink, changes);

  return (
    <>
      <Modal
        title="Kirim Link Video"
        onClose={isSubmitting ? () => undefined : requestClose}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={requestClose} disabled={isSubmitting}>
              Batal
            </Button>
            <Button
              type="button"
              variant="accent"
              onClick={() => setConfirming(true)}
              disabled={cannotSend}
            >
              {isSubmitting ? "Mengirim..." : "Kirim Link"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TaskSummary content={content} />

          {firstLink ? <p className="text-[12.5px] text-muted">Isi minimal satu link.</p> : null}

          {shown.map((platform) => (
            <LinkField
              key={platform}
              platform={platform}
              value={draft[platform]}
              error={problems[platform] ?? serverErrors[platform] ?? ""}
              disabled={isSubmitting}
              onChange={(value) => change(platform, value)}
              // Enter asks to send as the button would, and nothing the button would not.
              onEnter={() => {
                if (!cannotSend) setConfirming(true);
              }}
            />
          ))}

          {/* General failures are announced to assistive technology as an alert. */}
          {submissionError ? (
            <p role="alert" className={FIELD_ERROR}>
              {submissionError}
            </p>
          ) : null}
        </div>
      </Modal>
      {confirming ? (
        <ConfirmDialog
          title={question.title}
          message={question.message}
          confirmLabel="Ya, Kirim"
          cancelLabel="Periksa Lagi"
          confirmVariant="accent"
          onConfirm={() => void handleSubmit()}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
      {confirmDialog}
    </>
  );
}

/** One platform's link field, with its message directly below it. */
function LinkField({
  platform,
  value,
  error,
  disabled,
  onChange,
  onEnter,
}: Readonly<{
  platform: VideoPlatform;
  value: string;
  error: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onEnter: () => void;
}>) {
  const errorId = useId();
  const label = `Link ${PLATFORM_LABELS[platform]}`;

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-ink">{label}</span>

      <input
        type="url"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onEnter();
        }}
        className={FIELD}
      />

      {error ? (
        <p id={errorId} className={FIELD_ERROR}>
          {error}
        </p>
      ) : null}
    </label>
  );
}
