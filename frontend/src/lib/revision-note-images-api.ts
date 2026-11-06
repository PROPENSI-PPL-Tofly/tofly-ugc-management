// The revision note's screenshots against 34.1's routes (PBI-34, subtask 34.2): one place that
// knows the URLs, the "file" field and what the server answers, so the editor only ever sees a
// ScreenshotUploader (Adapter). Sent through this app's /api proxy, so BACKEND_URL never reaches
// the browser and the session cookie goes along.

import type { ScreenshotUploader } from "@/components/revision-note/use-screenshots";

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
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onload = () => {
          if (request.status === 201) {
            const stored = JSON.parse(request.responseText) as { id: string; url: string };
            resolve({ imageId: stored.id, url: stored.url });
            return;
          }
          const reason = request.status === 422 ? reasonIn(request.responseText) : null;
          reject(reason ? new UploadRefused(reason) : new Error(`upload failed (${request.status})`));
        };
        request.onerror = () => reject(new Error("upload failed (network)"));
        request.onabort = () => reject(new Error("upload cancelled"));
        signal.addEventListener("abort", () => request.abort());

        const form = new FormData();
        form.append("file", file);
        request.send(form);
      });
    },

    async remove(imageId) {
      const response = await send(`${imagesOf(submissionId)}/${encodeURIComponent(imageId)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(`delete failed (${response.status})`);
    },
  };
}
