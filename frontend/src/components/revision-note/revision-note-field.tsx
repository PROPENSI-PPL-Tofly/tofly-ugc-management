"use client";

// The revision note as the form fills it in (PBI-34, subtask 34.2): the editor with its
// screenshots under it, a screenshot pasted or dropped into the text joining the list. The form
// reads one value: the note, whether any image is still uploading (AC 5) and which to send.

import { useEffect, useRef, useState } from "react";
import { RichNoteEditor, type RichNote } from "./rich-note-editor";
import { ScreenshotList } from "./screenshot-list";
import { useScreenshots, type ScreenshotUploader } from "./use-screenshots";

export interface RevisionNoteValue extends RichNote {
  uploading: boolean;
  imageIds: string[];
}

export interface RevisionNoteFieldProps {
  label: string;
  max: number;
  uploader: ScreenshotUploader;
  disabled?: boolean;
  onChange?: (value: RevisionNoteValue) => void;
}

const EMPTY_NOTE: RichNote = { html: "", text: "", length: 0 };

// The PBI-34 prototype's hint, which also tells the Admin a screenshot can be pasted or dragged.
const PLACEHOLDER =
  "Jelaskan bagian yang perlu diubah. Paste atau drag screenshot ke sini untuk melampirkan gambar.";

export function RevisionNoteField({
  label,
  max,
  uploader,
  disabled = false,
  onChange,
}: Readonly<RevisionNoteFieldProps>) {
  const screenshots = useScreenshots(uploader);
  const [note, setNote] = useState<RichNote>(EMPTY_NOTE);
  const { uploading, imageIds } = screenshots;

  // The latest onChange, so a form that passes a new function on each render is not told again
  // and again for nothing.
  const report = useRef(onChange);
  useEffect(() => {
    report.current = onChange;
  });

  useEffect(() => {
    report.current?.({ ...note, uploading, imageIds });
  }, [note, uploading, imageIds]);

  return (
    <div className="flex flex-col gap-2">
      <RichNoteEditor
        label={label}
        max={max}
        disabled={disabled}
        onChange={setNote}
        onFiles={screenshots.add}
        placeholder={PLACEHOLDER}
      />
      <ScreenshotList screenshots={screenshots} disabled={disabled} />
    </div>
  );
}
