"use client";

import { Modal } from "@/components/ui/modal";

export interface SubmitDraftModalProps {
  // The selected content that the creator wants to submit a draft for.
  content: {
    id: string;
    name: string;
    deadline: string;
  };

  // Called when the modal should be closed.
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
      {/* Content information is read-only, as required by the PRD. */}
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
    </Modal>
  );
}