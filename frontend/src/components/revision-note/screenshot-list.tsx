"use client";

// The screenshots under the revision note's editor (PBI-34, subtask 34.2): "Tambah Gambar", each
// image's tile while it uploads, fails or is done, and the help line the prototype words. It only
// draws; useScreenshots holds what happens.

import { useRef } from "react";
import { MIN_TARGET, PHONE_TARGET } from "@/components/ui/touch-target";
import { SCREENSHOT_MAX_COUNT, SCREENSHOT_TYPES } from "@/lib/revision-note-images";
import type { Upload } from "@/lib/revision-note-uploads";
import type { Screenshots } from "./use-screenshots";

// Pressed with a finger on a phone: 24px at every width, 44px tall below sm (WCAG 2.5.8, 2.5.5).
const SMALL_BUTTON = `rounded-md px-2 py-1 text-[12.5px] text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 ${MIN_TARGET} ${PHONE_TARGET}`;

function helpLine(uploading: boolean, left: number): string {
  if (uploading) return "Mengunggah gambar… tombol kirim aktif lagi setelah selesai.";
  if (left > 0) return `Sisa ${left} dari ${SCREENSHOT_MAX_COUNT} gambar · JPG, PNG, WebP · maks. 5 MB`;
  return `Maksimal ${SCREENSHOT_MAX_COUNT} gambar per catatan · hapus salah satu untuk menambah`;
}

interface TileProps {
  upload: Upload;
  disabled: boolean;
  // Its delete is on its way, so × waits.
  removing: boolean;
  onRetry: () => void;
  onRemove: () => void;
}

function Tile({ upload, disabled, removing, onRetry, onRemove }: Readonly<TileProps>) {
  return (
    <li className="relative flex w-36 flex-col gap-1 rounded-md border border-rule bg-surface p-1.5 text-xs">
      {upload.status === "done" ? (
        // A short-lived signed link from storage, so next/image's fixed hosts cannot list it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={upload.url} alt="Lampiran" className="max-h-20 rounded object-contain" />
      ) : (
        <span className="truncate text-ink">{upload.file.name}</span>
      )}
      {upload.status === "uploading" ? (
        <>
          <span
            role="progressbar"
            aria-label={upload.file.name}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={upload.progress}
            className="h-1 overflow-hidden rounded bg-surface-2"
          >
            <span className="block h-full bg-accent" style={{ width: `${upload.progress}%` }} />
          </span>
          <span className="text-muted">Mengunggah {upload.progress}%</span>
        </>
      ) : null}
      {upload.status === "failed" ? (
        <>
          <span className="text-red-ink">{upload.reason}</span>
          <button type="button" onClick={onRetry} disabled={disabled} className={SMALL_BUTTON}>
            Coba lagi
          </button>
        </>
      ) : null}
      <button
        type="button"
        aria-label="Hapus gambar"
        onClick={onRemove}
        disabled={disabled || removing}
        // The press reaches past the small circle, so a finger finds it without it covering more
        // of the thumbnail.
        className={`absolute right-0 top-0 flex min-w-6 translate-x-1/2 -translate-y-1/2 items-center justify-center disabled:opacity-40 max-sm:min-w-11 ${MIN_TARGET} ${PHONE_TARGET}`}
      >
        <span
          aria-hidden="true"
          className="flex size-5 items-center justify-center rounded-full bg-ink text-xs text-surface"
        >
          ×
        </span>
      </button>
    </li>
  );
}

interface PartProps {
  screenshots: Screenshots;
  disabled?: boolean;
}

const leftOf = (screenshots: Screenshots) =>
  Math.max(SCREENSHOT_MAX_COUNT - screenshots.uploads.length, 0);

// "Tambah Gambar" with how many are left, and the file picker it opens.
export function ScreenshotButton({ screenshots, disabled = false }: Readonly<PartProps>) {
  const picker = useRef<HTMLInputElement>(null);
  const left = leftOf(screenshots);

  return (
    <>
      <button
        type="button"
        onClick={() => picker.current?.click()}
        disabled={disabled || left === 0}
        className={SMALL_BUTTON}
      >
        Tambah Gambar <span className="text-muted">{left} sisa</span>
      </button>
      <input
        ref={picker}
        type="file"
        hidden
        multiple
        accept={SCREENSHOT_TYPES.join(",")}
        aria-label="Pilih gambar revisi"
        onChange={(event) => {
          screenshots.add([...(event.target.files ?? [])]);
          // Emptied, so picking the same file again still counts as a change.
          event.target.value = "";
        }}
      />
    </>
  );
}

// Each screenshot's tile, while it uploads, after it fails, and once it is stored. A stored image
// the text places is read there, so it has no tile; the text losing it brings its tile back.
export function ScreenshotTiles({
  screenshots,
  disabled = false,
  placed,
}: Readonly<PartProps & { placed?: ReadonlySet<string> }>) {
  const tiles = screenshots.uploads.filter(
    (upload) => !(upload.status === "done" && placed?.has(upload.imageId)),
  );
  if (tiles.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2 px-3 pb-2.5">
      {tiles.map((upload) => (
        <Tile
          key={upload.id}
          upload={upload}
          disabled={disabled}
          removing={screenshots.removing.has(upload.id)}
          onRetry={() => screenshots.retry(upload.id)}
          onRemove={() => screenshots.remove(upload.id)}
        />
      ))}
    </ul>
  );
}

// The help line, or the reason the last files were refused while it is shown.
export function ScreenshotHelp({ screenshots }: Readonly<Pick<PartProps, "screenshots">>) {
  if (screenshots.refusal) {
    return (
      <span role="alert" className="text-xs text-red-ink">
        {screenshots.refusal}
      </span>
    );
  }
  return (
    <span className="text-xs text-muted">
      {helpLine(screenshots.uploading, leftOf(screenshots))}
    </span>
  );
}

// The three parts on their own, for a form that has no editor to put them in.
export function ScreenshotList({ screenshots, disabled = false }: Readonly<PartProps>) {
  return (
    <div className="flex flex-col gap-2">
      <ScreenshotTiles screenshots={screenshots} disabled={disabled} />
      <div className="flex items-center justify-between gap-3">
        <ScreenshotHelp screenshots={screenshots} />
        <ScreenshotButton screenshots={screenshots} disabled={disabled} />
      </div>
    </div>
  );
}
