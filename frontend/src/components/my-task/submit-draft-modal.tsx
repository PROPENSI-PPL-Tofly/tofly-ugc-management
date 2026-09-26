"use client";

import { useState } from "react";
import { submitDraft } from "@/lib/draft-submission";
import { Modal } from "@/components/ui/modal";

export interface SubmitDraftModalProps {
  // The content selected by the creator.
  content: {
    id: string;
    name: string;
    deadline: string;
  };

  // Lets the parent component control when the modal closes.
  onClose: () => void;
}

export function SubmitDraftModal({
  content,
  onClose,
}: SubmitDraftModalProps) {
  // Stores the current value of the draft link field.
  const [draftLink, setDraftLink] = useState("");

  // Stores the optional note written for the admin.
  const [adminNotes, setAdminNotes] = useState("");

  // Stores a validation message for the draft link.
  const [draftLinkError, setDraftLinkError] = useState("");

  async function handleSubmit() {
    const trimmedLink = draftLink.trim();

    // Treat an empty or whitespace-only link as invalid.
    if (!trimmedLink) {
      setDraftLinkError("Link file draft wajib diisi");
      return;
    }

    // Remove an old validation message once the current value is valid.
    setDraftLinkError("");

    const trimmedNotes = adminNotes.trim();

    // Keep the HTTP request outside this component by using the submission service.
    await submitDraft(content.id, {
      link: trimmedLink,
      notes: trimmedNotes || null,
    });
  }

  return (
    <Modal
      title="Submit Draft"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={handleSubmit}
          className="cursor-pointer rounded-(--radius-control) px-4 py-2 text-sm"
        >
          Kirim Draft
        </button>
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
            Link File Draft *
          </span>

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

          {/* Only show the message when the link fails validation. */}
          {draftLinkError ? (
            <p className="text-sm text-red-600">
              {draftLinkError}
            </p>
          ) : null}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink">
            Catatan untuk Admin
          </span>

          <textarea
            aria-label="Catatan untuk Admin"
            rows={3}
            value={adminNotes}
            onChange={(event) => {
              setAdminNotes(event.target.value);
            }}
            className="resize-y rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
      </div>
    </Modal>
  );
}