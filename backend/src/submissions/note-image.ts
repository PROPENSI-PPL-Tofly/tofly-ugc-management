// A revision note's screenshots as the panels read them (PBI-34, 34.1): the stored rows speak
// `id` and `content_type`, and the browser opens each image through one route that answers with
// a short-lived signed link (AC 6). The URL needs no knowledge of who is asking, so any read
// path — the derived journey or the stored history — can build it from an id alone.

export interface StoredNoteImage {
  id: string;
  content_type: string;
}

export interface NoteImage {
  id: string;
  url: string;
  contentType: string;
}

/** Where the browser opens an image through; the signed link sits behind this route. */
export function revisionNoteImageUrl(imageId: string): string {
  return `/api/revision-note-images/${imageId}`;
}

export function noteImageOf(image: StoredNoteImage): NoteImage {
  return {
    id: image.id,
    url: revisionNoteImageUrl(image.id),
    contentType: image.content_type,
  };
}
