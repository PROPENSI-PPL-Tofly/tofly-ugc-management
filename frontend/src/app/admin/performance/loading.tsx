/**
 * The line shown while "Performa Konten" renders on the server, so a slow answer reads as
 * loading rather than as an empty page.
 */
export default function Loading() {
  return (
    <p role="status" className="px-5 py-14 text-center text-[13px] text-muted">
      Memuat data performa…
    </p>
  );
}
