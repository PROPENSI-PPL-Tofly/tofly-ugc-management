"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { isHttpUrl, type MyTask, submitDraft } from "@/lib/tasks";
import { ContentInfo } from "./content-info";

export const FIELD =
  "w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink";

const FORM_ID = "submit-draft-form";

/**
 * Submit Draft, or Resubmit Draft for content sent back for revision. The link is required
 * and must be an http(s) URL before Submit enables; the note is optional. The backend
 * re-checks everything, and its refusal is shown here verbatim.
 */
export function SubmitDraftModal({
  task,
  onClose,
  onSubmitted,
}: {
  task: MyTask;
  onClose: () => void;
  onSubmitted: (updated: MyTask) => void;
}) {
  const resubmit = task.actions.isResubmission;
  const [link, setLink] = useState("");
  const [creatorNotes, setCreatorNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkValid = isHttpUrl(link);
  const showLinkError = link.trim() !== "" && !linkValid;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!linkValid || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      onSubmitted(await submitDraft(task.id, { link, creatorNotes }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setSubmitting(false);
    }
  };

  const revisionNotes = task.latestDraft?.revisionNotes;

  return (
    <Modal
      title={resubmit ? "Resubmit Draft" : "Submit Draft"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={!linkValid || submitting}>
            {submitting ? "Mengirim…" : "Submit"}
          </Button>
        </>
      }
    >
      <ContentInfo task={task} />

      {resubmit && revisionNotes ? (
        <div className="rounded-[var(--radius-control)] bg-amber-wash px-4 py-3 text-[13px]">
          <p className="font-semibold text-amber">Catatan revisi dari Admin</p>
          <p className="mt-0.5 whitespace-pre-line text-ink">{revisionNotes}</p>
        </div>
      ) : null}

      <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div>
          <label htmlFor="draft-link" className="mb-1 block text-[13px] font-semibold">
            Link file draft <span className="text-red">*</span>
          </label>
          <input
            id="draft-link"
            type="url"
            required
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://drive.google.com/…"
            aria-invalid={showLinkError}
            aria-describedby={showLinkError ? "draft-link-error" : undefined}
            className={FIELD}
          />
          {showLinkError ? (
            <p id="draft-link-error" className="mt-1 text-xs text-red">
              Masukkan link lengkap yang diawali http:// atau https://
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="draft-notes" className="mb-1 block text-[13px] font-semibold">
            Catatan untuk Admin <span className="font-normal text-muted">(opsional)</span>
          </label>
          <textarea
            id="draft-notes"
            rows={3}
            maxLength={1000}
            value={creatorNotes}
            onChange={(event) => setCreatorNotes(event.target.value)}
            className={FIELD}
          />
        </div>

        {error ? (
          <p role="alert" className="text-[13px] text-red">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
