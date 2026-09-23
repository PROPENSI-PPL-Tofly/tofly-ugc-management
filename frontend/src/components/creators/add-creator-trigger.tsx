"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AddCreatorModal } from "./add-creator-modal";

/**
 * Owns the open/closed state for AddCreatorModal, kept separate from CreatorTable's
 * row-scoped CreatorDetailModal state since adding a creator is not a per-row action.
 *
 * onSubmit is a no-op for now — there is no POST /creators endpoint yet, and wiring it up
 * is a separate, later piece of work.
 */
export function AddCreatorTrigger({
  existingEmails = [],
}: {
  /** Passed straight through to AddCreatorModal — see its own prop for what this covers. */
  existingEmails?: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="accent" onClick={() => setOpen(true)}>
        + Tambah Creator
      </Button>

      {open ? (
        <AddCreatorModal
          onClose={() => setOpen(false)}
          onSubmit={() => {}}
          existingEmails={existingEmails}
        />
      ) : null}
    </>
  );
}
