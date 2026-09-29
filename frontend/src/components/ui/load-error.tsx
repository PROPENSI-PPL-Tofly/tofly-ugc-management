"use client";

import { buttonClasses } from "./button-classes";

/**
 * A view whose data did not arrive. Raised as an alert so it is announced, and offers one way to
 * try again: a link back to the same URL (filters and page kept) or a callback for views that
 * load in the browser.
 */
export function LoadError({
  title,
  message = "Server tidak menjawab. Periksa koneksi lalu coba lagi.",
  retryHref,
  onRetry,
}: {
  title: string;
  message?: string;
  retryHref?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="px-5 py-14 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-muted">{message}</p>

      {retryHref ? (
        // A plain anchor, not next/link: a full reload is the point after a failed request.
        <a href={retryHref} className={`mt-4 inline-block ${buttonClasses()}`}>
          Muat ulang
        </a>
      ) : null}

      {!retryHref && onRetry ? (
        <button type="button" onClick={onRetry} className={`mt-4 ${buttonClasses()}`}>
          Muat ulang
        </button>
      ) : null}
    </div>
  );
}
