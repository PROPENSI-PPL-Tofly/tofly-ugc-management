// The revision note's screenshots against 34.1's routes (PBI-34, subtask 34.2): one place that
// knows the URLs, the "file" field and what the server answers, so the editor only ever sees a
// ScreenshotUploader (Adapter). Sent through this app's /api proxy, so BACKEND_URL never reaches
// the browser and the session cookie goes along.

import type { ScreenshotUploader, StoredImage } from "./revision-note-uploads";

/** A file 34.1 turned down, with the reason it gives (AC 4). */
export class UploadRefused extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "UploadRefused";
  }
}

// What the adapter talks through; the browser's own by default, a test's fakes otherwise.
export interface UploaderIo {
  request?: () => XMLHttpRequest;
  fetch?: typeof fetch;
}

// The ids are encoded, so a crafted value cannot climb out of /submissions/ (OWASP A01).
function imagesOf(submissionId: string): string {
  return `/api/submissions/${encodeURIComponent(submissionId)}/revision-note-images`;
}

// Long enough for 5 MB on a slow line; a request that hangs past it fails and can be retried.
const UPLOAD_TIMEOUT_MS = 60_000;

// The stored image in a 201, or null when the answer cannot be read as one (a proxy's error
// page, say), so the upload fails instead of waiting for good.
function storedImageIn(responseText: string): StoredImage | null {
  try {
    const body = JSON.parse(responseText) as { id?: unknown; url?: unknown };
    return typeof body.id === "string" && typeof body.url === "string"
      ? { imageId: body.id, url: body.url }
      : null;
  } catch {
    return null;
  }
}

function reasonIn(responseText: string): string | null {
  try {
    const body = JSON.parse(responseText) as { message?: unknown };
    return typeof body.message === "string" ? body.message : null;
  } catch {
    return null;
  }
}

export function screenshotUploader(submissionId: string, io: UploaderIo = {}): ScreenshotUploader {
  const newRequest = io.request ?? (() => new XMLHttpRequest());
  const send = io.fetch ?? fetch;

  return {
    // XMLHttpRequest rather than fetch: only it tells how much of the upload has gone (AC 5).
    upload(file, { onProgress, signal }) {
      return new Promise((resolve, reject) => {
        const request = newRequest();
        request.open("POST", imagesOf(submissionId));
        request.timeout = UPLOAD_TIMEOUT_MS;
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onload = () => {
          if (request.status === 201) {
            const stored = storedImageIn(request.responseText);
            if (stored) resolve(stored);
            else reject(new Error("upload failed (unreadable answer)"));
            return;
          }
          const reason = request.status === 422 ? reasonIn(request.responseText) : null;
          reject(reason ? new UploadRefused(reason) : new Error(`upload failed (${request.status})`));
        };
        request.onerror = () => reject(new Error("upload failed (network)"));
        request.onabort = () => reject(new Error("upload cancelled"));
        request.ontimeout = () => reject(new Error("upload failed (timeout)"));
        signal.addEventListener("abort", () => request.abort(), { once: true });

        const form = new FormData();
        form.append("file", file);
        request.send(form);
      });
    },

    async list() {
      const response = await send(imagesOf(submissionId));
      if (!response.ok) throw new Error(`list failed (${response.status})`);
      const images = (await response.json()) as { id?: unknown; url?: unknown; sent?: unknown }[];
      // Sent images belong to an earlier note's history; an entry without an id or a link is
      // skipped rather than drawn as a broken tile.
      return images.flatMap((image) =>
        image.sent === false && typeof image.id === "string" && typeof image.url === "string"
          ? [{ imageId: image.id, url: image.url }]
          : [],
      );
    },

    async remove(imageId) {
      const response = await send(`${imagesOf(submissionId)}/${encodeURIComponent(imageId)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(`delete failed (${response.status})`);
    },
  };
}
