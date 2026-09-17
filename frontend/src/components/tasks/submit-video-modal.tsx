"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { detectVideoPlatform, type MyTask, PLATFORM_LABELS, submitVideo } from "@/lib/tasks";
import { ContentInfo } from "./content-info";
import { FIELD } from "./submit-draft-modal";

const FORM_ID = "submit-video-form";

/**
 * Submit Link Video. The link must point at Instagram or TikTok (judged by domain) before
 * Submit enables. Submitting marks the content "Content Link Submitted" straight away, with
 * no approval step, so the dialog says so before the creator commits.
 */
export function SubmitVideoModal({
  task,
  onClose,
  onSubmitted,
}: {
  task: MyTask;
  onClose: () => void;
  onSubmitted: (updated: MyTask) => void;
}) {
  const [link, setLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const platform = detectVideoPlatform(link);
  const showLinkError = link.trim() !== "" && !platform;
  const viaGracePeriod = task.status !== "draft_approved" && task.actions.inGracePeriod;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!platform || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      onSubmitted(await submitVideo(task.id, link));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Submit Link Video"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={!platform || submitting}>
            {submitting ? "Mengirim…" : "Submit"}
          </Button>
        </>
      }
    >
      <ContentInfo task={task} />

      {viaGracePeriod ? (
        <p className="rounded-[var(--radius-control)] bg-amber-wash px-4 py-3 text-[13px] text-ink">
          Konten ini sudah masuk masa tenggang H-1, jadi link video bisa dikirim walaupun draft
          belum disetujui.
        </p>
      ) : null}

      <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div>
          <label htmlFor="video-link" className="mb-1 block text-[13px] font-semibold">
            Link video yang sudah diupload <span className="text-red">*</span>
          </label>
          <input
            id="video-link"
            type="url"
            required
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://www.instagram.com/reel/… atau https://www.tiktok.com/@…"
            aria-invalid={showLinkError}
            aria-describedby={showLinkError ? "video-link-error" : undefined}
            className={FIELD}
          />
          {showLinkError ? (
            <p id="video-link-error" className="mt-1 text-xs text-red">
              Link harus berupa URL Instagram (instagram.com) atau TikTok (tiktok.com).
            </p>
          ) : null}
          {platform ? (
            <p className="mt-1 text-xs text-muted">Platform terdeteksi: {PLATFORM_LABELS[platform]}</p>
          ) : null}
        </div>

        <p className="text-xs text-muted">
          Setelah dikirim, status konten langsung menjadi Content Link Submitted tanpa perlu
          persetujuan lagi.
        </p>

        {error ? (
          <p role="alert" className="text-[13px] text-red">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
