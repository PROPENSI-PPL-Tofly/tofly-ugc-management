import { safeHref } from "@/lib/safe-href";

const LOOKS = {
  /** A text link with its address printed under it, so it is clear where it leads first. */
  inline: "font-semibold text-accent-deep underline underline-offset-2",
  /** A small bordered chip, for a link that sits among other lines of an entry. */
  chip: "inline-flex max-w-full items-center gap-1 rounded-(--radius-control) border border-rule bg-surface px-2 py-1 text-xs font-semibold text-ink hover:border-ink-2",
} as const;

/**
 * A link a creator typed: clickable only when it is a web address, and then always in a new
 * tab that cannot reach back into this one. Anything else is shown as text, so what was sent
 * is still visible without a click being able to run it (OWASP A03).
 */
export function CreatorLink({
  link,
  label,
  look = "inline",
}: Readonly<{ link: string; label: string; look?: keyof typeof LOOKS }>) {
  const href = safeHref(link);

  if (!href) {
    return (
      <>
        <span className="break-all">{link}</span>
        <p className="mt-1 text-xs text-red-ink">
          Link ini bukan link web yang valid, jadi tidak bisa dibuka.
        </p>
      </>
    );
  }

  return (
    <>
      <a href={href} target="_blank" rel="noopener noreferrer" className={LOOKS[look]}>
        {label}
        {look === "chip" ? <span aria-hidden="true"> ↗</span> : null}
      </a>

      {look === "inline" ? <p className="mt-1 break-all text-xs text-muted">{href}</p> : null}
    </>
  );
}
