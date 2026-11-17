"use client";

// The revision note as the form fills it in (PBI-34, subtask 34.2): the editor with its
// screenshots under it, a screenshot pasted or dropped into the text joining the list. The form
// reads one value: the note, whether any image is still uploading (AC 5) and which to send.

import { useEffect, useMemo, useRef, useState } from "react";
import { RichNoteEditor, type RichNote, type RichNoteEditorHandle } from "./rich-note-editor";
import { ScreenshotButton, ScreenshotHelp, ScreenshotTiles } from "./screenshot-list";
import type { ScreenshotUploader } from "@/lib/revision-note-uploads";
import { useScreenshots } from "./use-screenshots";

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
  // The form's own settings for its note, handed to the editor (see RichNoteEditorProps).
  autoFocus?: boolean;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onBlur?: () => void;
  // The hint on the empty note; the revision note's own, which names screenshots, by default.
  placeholder?: string;
}

// An image the note places, by its id: `data-image-id="…"`.
const IMAGE_ID = /data-image-id="([^"]+)"/g;

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
  ...form
}: Readonly<RevisionNoteFieldProps>) {
  const screenshots = useScreenshots(uploader);
  const [note, setNote] = useState<RichNote>(EMPTY_NOTE);
  const { uploading, imageIds, uploads } = screenshots;
  const editor = useRef<RichNoteEditorHandle>(null);
  // The uploads that started in this form, and the images already placed in the text: only what
  // was uploaded here is placed, never what a closed form left on the server.
  const startedHere = useRef(new Set<string>());
  const placed = useRef(new Set<string>());

  // An image lands in the text, at the cursor, once it is stored; and leaves it with its tile.
  useEffect(() => {
    const stored = new Set<string>();
    for (const upload of uploads) {
      if (upload.status === "uploading") startedHere.current.add(upload.id);
      if (upload.status !== "done") continue;
      stored.add(upload.imageId);
      if (startedHere.current.has(upload.id) && !placed.current.has(upload.imageId)) {
        placed.current.add(upload.imageId);
        editor.current?.insertImage(upload.imageId);
      }
    }
    for (const imageId of placed.current) {
      if (stored.has(imageId)) continue;
      placed.current.delete(imageId);
      editor.current?.removeImage(imageId);
    }
  }, [uploads]);

  // The images the text holds now, read from the note it reports, so a tile shows only for an
  // image the text does not place.
  const inText = useMemo(() => new Set([...note.html.matchAll(IMAGE_ID)].map((found) => found[1])), [note.html]);

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
        editorRef={editor}
        onRemoveImage={(imageId) => {
          const stored = uploads.find((upload) => upload.status === "done" && upload.imageId === imageId);
          if (stored) screenshots.remove(stored.id);
        }}
        label={label}
        max={max}
        disabled={disabled}
        onChange={setNote}
        onFiles={screenshots.add}
        placeholder={PLACEHOLDER}
        {...form}
        toolbarEnd={<ScreenshotButton screenshots={screenshots} disabled={disabled} />}
        attachments={<ScreenshotTiles screenshots={screenshots} disabled={disabled} placed={inText} />}
        footer={<ScreenshotHelp screenshots={screenshots} />}
      />
    </div>
  );
}
