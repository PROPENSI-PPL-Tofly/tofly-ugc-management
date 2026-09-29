/**
 * The "12/100" counter under a limited text field. The field itself carries maxLength, which
 * stops typing silently at the limit; this says so out loud once the field is full, so a key
 * press that does nothing (or a paste that got cut) is never a mystery. Point the field's
 * aria-describedby at `id`.
 */
export function CharLimit({ id, length, max }: { id: string; length: number; max: number }) {
  const full = length >= max;

  return (
    <span id={id} className="flex items-center justify-between gap-3 text-xs">
      {full ? (
        <span role="alert" className="font-semibold text-red-ink">
          Maksimal {max} karakter
        </span>
      ) : (
        <span />
      )}{" "}
      <span
        data-full={full}
        className="tabular-nums text-muted data-[full=true]:font-semibold data-[full=true]:text-red-ink"
      >
        {`${length}/${max} `}
        <span className="sr-only">karakter</span>
      </span>
    </span>
  );
}
