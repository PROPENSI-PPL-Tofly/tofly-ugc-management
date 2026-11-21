import type { NoteImage } from "@/lib/content-detail";
import { NoteImages, NoteImageViewer } from "./note-images";
import { placedImageIds, RichNote } from "./rich-note";

// A revision note as the Content Detail panel reads it (PBI-34, 34.3): its formatting and its
// screenshots, for the creator and the admin alike. A screenshot the admin placed in the text reads
// where it was placed; the rest sit under it as thumbnails. A note from before formatting has
// neither and reads as it always did (AC 9).

export function RevisionNote({
  note,
  noteHtml,
  images = [],
}: Readonly<{ note?: string; noteHtml?: string; images?: readonly NoteImage[] }>) {
  const placed = noteHtml ? placedImageIds(noteHtml, images) : undefined;

  return (
    <NoteImageViewer images={images}>
      {noteHtml ? <RichNote html={noteHtml} images={images} /> : <p className="whitespace-pre-line">{note}</p>}
      {images.length ? <NoteImages images={images} placed={placed} /> : null}
    </NoteImageViewer>
  );
}
