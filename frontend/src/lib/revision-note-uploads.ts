// Each screenshot of a revision note on its way to storage (PBI-34, subtask 34.2): uploading with
// its progress, failed with a reason, or done with the stored image. A step only moves an upload
// out of the state it fits (Coba lagi only after a failure), so a late answer from the upload can
// never undo what the Admin did last. Pure module: a list goes in, a new list comes out.

import { screenshotRefusal, type ScreenshotFile } from "./revision-note-images";

export type Upload<F extends ScreenshotFile = File> =
  | { id: string; file: F; status: "uploading"; progress: number }
  | { id: string; file: F; status: "failed"; reason: string }
  | { id: string; file: F; status: "done"; imageId: string; url: string };

/** What storage answers for an image it kept: its id and a short-lived link to show it. */
export interface StoredImage {
  imageId: string;
  url: string;
}

type Status = Upload["status"];
type In<F extends ScreenshotFile, S extends Status> = Extract<Upload<F>, { status: S }>;

// Moves the upload with this id only when it is in the state the step starts from.
function step<F extends ScreenshotFile, S extends Status>(
  uploads: readonly Upload<F>[],
  id: string,
  from: S,
  to: (upload: In<F, S>) => Upload<F>,
): Upload<F>[] {
  return uploads.map((upload) =>
    upload.id === id && upload.status === from ? to(upload as In<F, S>) : upload,
  );
}

// Takes each file the rules allow, in order. Every upload in the list counts toward the five,
// the uploading and failed ones too, as the prototype counts them.
export function addScreenshots<F extends ScreenshotFile>(
  uploads: readonly Upload<F>[],
  files: readonly F[],
  nextId: () => string,
): { uploads: Upload<F>[]; refusals: string[] } {
  const next = [...uploads];
  const refusals: string[] = [];
  for (const file of files) {
    const refusal = screenshotRefusal(file, next.length);
    if (refusal) refusals.push(refusal);
    else next.push({ id: nextId(), file, status: "uploading", progress: 0 });
  }
  return { uploads: next, refusals };
}

export function progressed<F extends ScreenshotFile>(
  uploads: readonly Upload<F>[],
  id: string,
  percent: number,
): Upload<F>[] {
  return step(uploads, id, "uploading", (upload) => ({
    ...upload,
    progress: Math.min(100, Math.max(0, percent)),
  }));
}

export function uploaded<F extends ScreenshotFile>(
  uploads: readonly Upload<F>[],
  id: string,
  stored: StoredImage,
): Upload<F>[] {
  return step(uploads, id, "uploading", (upload) => ({
    id: upload.id,
    file: upload.file,
    status: "done",
    ...stored,
  }));
}

export function failed<F extends ScreenshotFile>(
  uploads: readonly Upload<F>[],
  id: string,
  reason: string,
): Upload<F>[] {
  return step(uploads, id, "uploading", (upload) => ({
    id: upload.id,
    file: upload.file,
    status: "failed",
    reason,
  }));
}

// Coba lagi: only a failed upload starts again, from 0%.
export function retried<F extends ScreenshotFile>(
  uploads: readonly Upload<F>[],
  id: string,
): Upload<F>[] {
  return step(uploads, id, "failed", (upload) => ({
    id: upload.id,
    file: upload.file,
    status: "uploading",
    progress: 0,
  }));
}

export function removed<F extends ScreenshotFile>(
  uploads: readonly Upload<F>[],
  id: string,
): Upload<F>[] {
  return uploads.filter((upload) => upload.id !== id);
}

/** AC 5: Kirim Revisi waits while this is true. */
export function isUploading(uploads: readonly Upload<ScreenshotFile>[]): boolean {
  return uploads.some((upload) => upload.status === "uploading");
}

/** The stored images the note is sent with, in the order the Admin added them. */
export function imageIds(uploads: readonly Upload<ScreenshotFile>[]): string[] {
  return uploads.flatMap((upload) => (upload.status === "done" ? [upload.imageId] : []));
}
