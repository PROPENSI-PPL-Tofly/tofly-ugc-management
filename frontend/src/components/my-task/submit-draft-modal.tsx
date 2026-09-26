"use client";

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
  return (
    <Modal
      title="Submit Draft"
      onClose={onClose}
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

        {/* The creator must provide a link to the draft file. */}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink">
            Link File Draft *
          </span>

          <input
            type="url"
            required
            aria-label="Link File Draft"
            className="rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>

        {/* This field is intentionally optional. */}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink">
            Catatan untuk Admin
          </span>

          <textarea
            aria-label="Catatan untuk Admin"
            rows={3}
            className="resize-y rounded-(--radius-control) border border-rule bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
      </div>
    </Modal>
  );
}