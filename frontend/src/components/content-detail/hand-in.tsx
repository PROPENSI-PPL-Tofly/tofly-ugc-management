"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDraftHandIn, type DraftAction } from "@/components/my-task/submit-draft-modal";
import { useVideoLinksHandIn } from "@/components/my-task/submit-video-modal";
import { useDiscardGuard } from "@/components/ui/use-discard-guard";
import type { DraftSubmitter } from "@/lib/draft-submission";
import type { SentLink, VideoPlatform } from "@/lib/video-links";
import type { VideoLinksSaver } from "@/lib/video-links-api";

/** What the form lets the panel know: it is leaving, it went through, and whether it holds typing. */
interface HandInProps {
  contentId: string;
  /** Leaves the form for the step it came from, by Batal or after a send. */
  onLeave: () => void;
  /** A send went through; the panel confirms it and reads the content again. */
  onSent: () => void;
  /** Whether leaving would lose what was typed, so closing the panel can ask first. */
  onDirtyChange: (dirty: boolean) => void;
  /** The panel's foot, where Batal and the send button go; under the fields until it exists. */
  actionsTarget?: HTMLElement | null;
}

/** The form's buttons in the panel's foot once it is there, under the fields until then. */
function Actions({ target, children }: Readonly<{ target?: HTMLElement | null; children: ReactNode }>) {
  return target ? createPortal(children, target) : <div className="flex justify-end gap-2">{children}</div>;
}

/** Tells the panel whether the form holds typing, and that it does not once it is gone. */
function useReportDirty(dirty: boolean, onDirtyChange: (dirty: boolean) => void) {
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
}

/**
 * Submit Draft and Resubmit Draft inside Content Detail: the creator hands in from the same panel
 * that shows the brief and the journey, as the admin's revision form opens in it, rather than
 * from a second dialog. The step's own buttons give way to these.
 */
export function DraftHandIn({
  contentId,
  action,
  submitDraft,
  onLeave,
  onSent,
  onDirtyChange,
  actionsTarget,
}: HandInProps & { action: DraftAction; submitDraft?: DraftSubmitter }) {
  const form = useDraftHandIn({
    contentId,
    action,
    submitDraftAction: submitDraft,
    onSubmitted: onSent,
    onClose: onLeave,
  });
  const { requestClose, confirmDialog } = useDiscardGuard({
    isDirty: form.dirty,
    onDiscard: onLeave,
    title: "Batalkan pengiriman draft?",
  });
  useReportDirty(form.dirty, onDirtyChange);

  return (
    <div className="mt-3 flex w-full flex-col gap-3">
      {form.fields}
      <Actions target={actionsTarget}>{form.renderActions(requestClose)}</Actions>
      {confirmDialog}
    </div>
  );
}

/**
 * Kirim Link Video inside Content Detail, for a first link and for adding or replacing one later:
 * the links already sent start in their fields.
 */
export function VideoLinksHandIn({
  contentId,
  links,
  saveLinks,
  onPartlySaved,
  onLeave,
  onSent,
  onDirtyChange,
  actionsTarget,
  only,
}: HandInProps & {
  /** One platform's field alone: the link changed (or added) from its card. */
  only?: VideoPlatform;
  links: readonly SentLink[];
  saveLinks?: VideoLinksSaver;
  onPartlySaved: () => void;
}) {
  const form = useVideoLinksHandIn({
    contentId,
    links,
    only,
    saveLinksAction: saveLinks,
    onSubmitted: onSent,
    onPartlySaved,
    onClose: onLeave,
  });
  const { requestClose, confirmDialog } = useDiscardGuard({
    isDirty: form.dirty,
    onDiscard: onLeave,
    title: "Batalkan pengiriman link video?",
  });
  useReportDirty(form.dirty, onDirtyChange);

  return (
    <div className="mt-3 flex w-full flex-col gap-3">
      {form.fields}
      <Actions target={actionsTarget}>{form.renderActions(requestClose)}</Actions>
      {form.confirmation}
      {confirmDialog}
    </div>
  );
}
