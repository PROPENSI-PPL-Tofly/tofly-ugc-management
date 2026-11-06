"use client";

// The screenshots of one revision note while the Admin writes it (PBI-34, subtask 34.2, AC 3–5):
// which were taken, each upload's progress, a failure to retry, and why a file was refused. The
// upload itself is whatever ScreenshotUploader the form passes in, so this never knows the API.

import { useEffect, useRef, useState } from "react";
import {
  addScreenshots,
  failed,
  imageIds,
  isUploading,
  progressed,
  removed,
  retried,
  uploaded,
  type StoredImage,
  type Upload,
} from "@/lib/revision-note-uploads";

/** What a failed upload says on its tile, as the prototype words it. */
export const UPLOAD_FAILED = "Gagal diunggah";

// How long a refusal stays on screen, as the prototype shows it.
const MESSAGE_MS = 3500;

/** Sends one screenshot to storage, telling its progress; aborting the signal cancels it. */
export interface ScreenshotUploader {
  upload(
    file: File,
    options: { onProgress: (percent: number) => void; signal: AbortSignal },
  ): Promise<StoredImage>;
}

export interface Screenshots {
  uploads: readonly Upload[];
  // Why the last files were refused, until it steps back after a few seconds.
  refusal: string | null;
  // AC 5: Kirim Revisi waits while this is true.
  uploading: boolean;
  imageIds: string[];
  add: (files: readonly File[]) => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
}

export function useScreenshots(uploader: ScreenshotUploader): Screenshots {
  const [uploads, setUploads] = useState<readonly Upload[]>([]);
  const [refusal, setRefusal] = useState<string | null>(null);
  // The list as it stands right now, so a step reads it without waiting for a render.
  const current = useRef<readonly Upload[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const lastId = useRef(0);

  useEffect(() => {
    if (!refusal) return;
    const timer = setTimeout(() => setRefusal(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [refusal]);

  function apply(change: (list: readonly Upload[]) => Upload[]) {
    current.current = change(current.current);
    setUploads(current.current);
  }

  function start(id: string, file: File) {
    const controller = new AbortController();
    controllers.current.set(id, controller);
    uploader
      .upload(file, {
        signal: controller.signal,
        onProgress: (percent) => apply((list) => progressed(list, id, percent)),
      })
      .then(
        (stored) => apply((list) => uploaded(list, id, stored)),
        () => apply((list) => failed(list, id, UPLOAD_FAILED)),
      )
      .finally(() => controllers.current.delete(id));
  }

  function add(files: readonly File[]) {
    const before = current.current;
    const taken = addScreenshots(before, files, () => `shot-${++lastId.current}`);
    apply(() => taken.uploads);
    // Each refused file's own reason (AC 4), each said once.
    if (taken.refusals.length > 0) setRefusal([...new Set(taken.refusals)].join(" · "));
    for (const upload of taken.uploads.slice(before.length)) start(upload.id, upload.file);
  }

  function retry(id: string) {
    const upload = current.current.find((each) => each.id === id);
    if (upload?.status !== "failed") return;
    apply((list) => retried(list, id));
    start(id, upload.file);
  }

  function remove(id: string) {
    controllers.current.get(id)?.abort();
    apply((list) => removed(list, id));
  }

  return {
    uploads,
    refusal,
    uploading: isUploading(uploads),
    imageIds: imageIds(uploads),
    add,
    retry,
    remove,
  };
}
