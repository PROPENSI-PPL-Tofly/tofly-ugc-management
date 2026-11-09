"use client";

// The screenshots of one revision note while the Admin writes it (PBI-34, subtask 34.2, AC 3–5):
// which were taken, each upload's progress, a failure to retry, and why a file was refused. The
// upload itself is whatever ScreenshotUploader the form passes in, so this never knows the API.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addScreenshots,
  failed,
  imageIds,
  isUploading,
  progressed,
  removed,
  restored,
  retried,
  uploaded,
  type ScreenshotUploader,
  type Upload,
} from "@/lib/revision-note-uploads";
import { UploadRefused } from "@/lib/revision-note-images-api";

/** What a failed upload says on its tile, as the prototype words it. */
export const UPLOAD_FAILED = "Gagal diunggah";

/** What the help line says when the server keeps an image the Admin asked to remove. */
export const REMOVE_FAILED = "Gambar gagal dihapus. Coba lagi.";

// How long a refusal stays on screen, as the prototype shows it.
const MESSAGE_MS = 3500;

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
  // The stored images whose delete is on its way; their × waits for the server's answer.
  removing: ReadonlySet<string>;
}

export function useScreenshots(uploader: ScreenshotUploader): Screenshots {
  const [uploads, setUploads] = useState<readonly Upload[]>([]);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  // Read before React renders again, so a second press in the same moment is seen too.
  const deleting = useRef(new Set<string>());
  // The list as it stands right now, so a step reads it without waiting for a render.
  const current = useRef<readonly Upload[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const lastId = useRef(0);

  useEffect(() => {
    if (!refusal) return;
    const timer = setTimeout(() => setRefusal(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [refusal]);

  // The uploader the field opened with; reading it from here keeps the list below to one read
  // per opening, even when the form passes a new uploader on each render.
  const opening = useRef(uploader);

  // Review on #188: what a closed form left on the server comes back, so the five on screen are
  // the five the server counts. A list that cannot be read leaves the field empty; the server
  // still refuses a sixth image with its own reason.
  useEffect(() => {
    opening.current.list().then(
      (images) => {
        current.current = restored(current.current, images, () => `shot-${++lastId.current}`);
        setUploads(current.current);
      },
      () => undefined,
    );
  }, []);

  // A form that closes mid-upload cancels what is still running, rather than leave it going.
  useEffect(() => {
    const running = controllers.current;
    return () => running.forEach((controller) => controller.abort());
  }, []);

  // Stays the same list while the uploads do, so the form is only told when it changes.
  const ids = useMemo(() => imageIds(uploads), [uploads]);

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
        (error: unknown) => {
          // Turned down by the server: it leaves the list with its reason on the help line, as
          // the prototype shows a refusal. Anything else broke on the way and can be retried.
          if (error instanceof UploadRefused) {
            apply((list) => removed(list, id));
            setRefusal(error.message);
            return;
          }
          apply((list) => failed(list, id, UPLOAD_FAILED));
        },
      )
      .finally(() => controllers.current.delete(id));
  }

  function add(files: readonly File[]) {
    const before = current.current;
    const taken = addScreenshots(before, files, () => `shot-${++lastId.current}`);
    apply(() => taken.uploads);
    // Each refused file's own reason (AC 4), each said once.
    if (taken.refusals.length > 0) setRefusal([...new Set(taken.refusals)].join(" · "));
    // The files just taken, each one uploading; each starts here.
    const added = taken.uploads
      .slice(before.length)
      .filter((upload): upload is Extract<Upload, { status: "uploading" }> => upload.status === "uploading");
    for (const upload of added) start(upload.id, upload.file);
  }

  function retry(id: string) {
    const upload = current.current.find((each) => each.id === id);
    if (upload?.status !== "failed") return;
    apply((list) => retried(list, id));
    start(id, upload.file);
  }

  function remove(id: string) {
    const upload = current.current.find((each) => each.id === id);
    // Stored on the server: it leaves the list once the server has deleted it, so the five the
    // list counts stay the five the server counts.
    if (upload?.status === "done") {
      // One delete at a time: a second one would be answered 404 for an image already gone.
      if (deleting.current.has(id)) return;
      deleting.current.add(id);
      setRemoving(new Set(deleting.current));
      uploader
        .remove(upload.imageId)
        .then(
          () => apply((list) => removed(list, id)),
          () => setRefusal(REMOVE_FAILED),
        )
        .finally(() => {
          deleting.current.delete(id);
          setRemoving(new Set(deleting.current));
        });
      return;
    }
    // Still uploading, or failed: nothing is stored yet, so it is only stopped here.
    controllers.current.get(id)?.abort();
    apply((list) => removed(list, id));
  }

  return {
    uploads,
    refusal,
    uploading: isUploading(uploads),
    imageIds: ids,
    add,
    retry,
    remove,
    removing,
  };
}
