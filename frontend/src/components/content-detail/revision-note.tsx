import type { NoteImage } from "@/lib/content-detail";
import { NoteImages } from "./note-images";
import { RichNote } from "./rich-note";

// A revision note as the Content Detail panel reads it (PBI-34, 34.3): its formatting and its
// screenshots, for the creator and the admin alike. A note from before formatting has neither
// and reads as it always did (AC 9).

export function RevisionNote({
  note,
  noteHtml,
  images,
}: Readonly<{ note?: string; noteHtml?: string; images?: readonly NoteImage[] }>) {
  return (
    <>
      {noteHtml ? <RichNote html={noteHtml} /> : <p className="whitespace-pre-line">{note}</p>}
      {images?.length ? <NoteImages images={images} /> : null}
    </>
  );
}
