"use client";

import { createElement, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { NoteImage } from "@/lib/content-detail";

// A revision note as the Content Detail panel reads it (PBI-34, 34.3): its formatting and its
// screenshots, for the creator and the admin alike. A note from before formatting has neither
// and reads as it always did (AC 9).

/** Every tag a note may hold, as the server's allowlist keeps them, with how each one looks. */
const NOTE_TAGS: Record<string, { tag: string; className?: string }> = {
  P: { tag: "p" },
  BR: { tag: "br" },
  STRONG: { tag: "strong", className: "font-semibold" },
  EM: { tag: "em", className: "italic" },
  UL: { tag: "ul", className: "list-disc pl-4" },
  OL: { tag: "ol", className: "list-decimal pl-4" },
  LI: { tag: "li" },
};

/** Tags whose text is code, not words, so it is dropped with them. */
const DROPPED_TAGS = new Set(["SCRIPT", "STYLE"]);

function isWebLink(href: string | null): href is string {
  return href !== null && /^https?:\/\//i.test(href);
}

function linkOf(element: Element, key: number, children: ReactNode[]): ReactNode {
  const href = element.getAttribute("href");
  if (!isWebLink(href)) return children;

  return (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="underline wrap-anywhere"
    >
      {children}
    </a>
  );
}

/**
 * The note's nodes as React elements. The server already sanitizes the note (AC 7); drawing it
 * tag by tag, instead of handing the browser the HTML, keeps anything else off the page even if
 * a stored note ever holds it: an unknown tag leaves only its words, and no attribute but a web
 * link's address is read.
 */
function drawNodes(parent: Node): ReactNode[] {
  return Array.from(parent.childNodes).map((node, key) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const element = node as Element;
    if (DROPPED_TAGS.has(element.tagName)) return null;

    const children = drawNodes(element);
    if (element.tagName === "A") return linkOf(element, key, children);

    const known = NOTE_TAGS[element.tagName];
    if (!known) return children;

    return createElement(known.tag, { key, className: known.className }, ...children);
  });
}

function RichNote({ html }: Readonly<{ html: string }>) {
  const parsed = new DOMParser().parseFromString(html, "text/html");

  return <div className="flex flex-col gap-1 wrap-anywhere">{drawNodes(parsed.body)}</div>;
}

const BROKEN_IMAGE = "Gambar gagal dimuat";

type ImageState = "loading" | "loaded" | "broken";

function Thumbnail({
  image,
  position,
  onOpen,
}: Readonly<{ image: NoteImage; position: number; onOpen: () => void }>) {
  const [state, setState] = useState<ImageState>("loading");

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
        onLoad={() => setState("loaded")}
        onError={() => setState("broken")}
        className="size-full object-cover"
      />
    </button>
  );
}

function FullImage({ image, position }: Readonly<{ image: NoteImage; position: number }>) {
  const [state, setState] = useState<ImageState>("loading");

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
        onLoad={() => setState("loaded")}
        onError={() => setState("broken")}
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

function NoteImages({ images }: Readonly<{ images: readonly NoteImage[] }>) {
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
