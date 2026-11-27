"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { saveDeadlineBuffer, type BufferSaver } from "@/lib/deadline-buffer";
import { useDeadlineBuffer } from "./deadline-buffer-context";
import { DeadlineBufferModal } from "./deadline-buffer-modal";

/**
 * The Content Plan's "Atur Buffer Deadline", rendered only for a Super Admin (the page decides).
 * The label names the buffer in force; a save closes the modal, confirms with a toast and fetches
 * the page again so the layout reads the new buffer for every picker.
 */
export function DeadlineBufferButton({
  saveAction = saveDeadlineBuffer,
}: Readonly<{ saveAction?: BufferSaver }>) {
  const router = useRouter();
  const bufferDays = useDeadlineBuffer();
  const [open, setOpen] = useState(false);
  const { show, toast } = useToast();

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Atur Buffer Deadline ({bufferDays} hari)
      </Button>

      {open ? (
        <DeadlineBufferModal
          current={bufferDays}
          saveAction={saveAction}
          onClose={() => setOpen(false)}
          onSaved={(saved) => {
            setOpen(false);
            show(`Buffer deadline diubah jadi ${saved} hari.`);
            router.refresh();
          }}
        />
      ) : null}
      {toast}
    </>
  );
}
