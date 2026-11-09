import { createElement, type ReactNode } from "react";

// A revision note's formatting (PBI-34, 34.3), drawn from the sanitized HTML the API sends.

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

export function RichNote({ html }: Readonly<{ html: string }>) {
  const parsed = new DOMParser().parseFromString(html, "text/html");

  return <div className="flex flex-col gap-1 wrap-anywhere">{drawNodes(parsed.body)}</div>;
}
