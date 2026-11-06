"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { NoteImage } from "@/lib/content-detail";

// A revision note's screenshots (PBI-34, 34.3): thumbnails, and one full-size overlay.

const BROKEN_IMAGE = "Gambar gagal dimuat";

type ImageState = "loading" | "loaded" | "broken";

/** Where an image stands, and the events its <img> reports that through. */
function useImageState() {
  const [state, setState] = useState<ImageState>("loading");

  return {
    state,
    events: { onLoad: () => setState("loaded"), onError: () => setState("broken") },
  };
}

function Thumbnail({
  image,
  position,
  onOpen,
}: Readonly<{ image: NoteImage; position: number; onOpen: () => void }>) {
  const { state, events } = useImageState();

  if (state === "broken") {
    return (
      <span className="flex h-15 w-20 items-center justify-center rounded-(--radius-control) border border-rule p-1 text-center text-[10.5px] leading-tight text-muted">
        {BROKEN_IMAGE}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Buka gambar ${position}`}
      aria-busy={state === "loading"}
      onClick={onOpen}
      className={`h-15 w-20 cursor-zoom-in overflow-hidden rounded-(--radius-control) border border-rule ${
        state === "loading" ? "animate-pulse bg-surface-2" : ""
      }`}
    >
      {/* A signed link of unknown size, so next/image has nothing to optimize or reserve. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt=""
        {...events}
        className="size-full object-cover"
      />
    </button>
  );
}

function FullImage({ image, position }: Readonly<{ image: NoteImage; position: number }>) {
  const { state, events } = useImageState();

  if (state === "broken") {
    return <p className="text-sm text-white">{BROKEN_IMAGE}</p>;
  }

  return (
    <>
      {state === "loading" ? <p className="text-sm text-white">Memuat gambar...</p> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={`Gambar ${position} catatan revisi`}
        {...events}
        className={
          state === "loading" ? "hidden" : "max-h-[88vh] max-w-[92vw] rounded-lg bg-white object-contain"
        }
      />
    </>
  );
}

/**
 * The full-size view, as the prototype draws it: the image alone on a dark screen, and a press
 * anywhere or Escape closes it. `data-modal-dialog` makes it the top dialog, so the panel behind
 * it answers neither that press nor that key.
 */
function ImageOverlay({
  label,
  onClose,
  children,
}: Readonly<{ label: string; onClose: () => void; children: ReactNode }>) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    overlayRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") event.preventDefault();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      data-modal-dialog=""
      onClick={onClose}
      className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 focus:outline-none"
    >
      {children}
    </div>
  );
}

export function NoteImages({ images }: Readonly<{ images: readonly NoteImage[] }>) {
  // One index, not a flag per thumbnail: only one overlay can ever be open (AC 8).
  const [opened, setOpened] = useState<number | null>(null);
  const close = useCallback(() => setOpened(null), []);

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {images.map((image, index) => (
          <Thumbnail
            key={image.id}
            image={image}
            position={index + 1}
            onOpen={() => setOpened(index)}
          />
        ))}
      </div>

      {opened === null ? null : (
        <ImageOverlay label={`Gambar ${opened + 1} dari ${images.length}`} onClose={close}>
          <FullImage image={images[opened]} position={opened + 1} />
        </ImageOverlay>
      )}
    </>
  );
}
