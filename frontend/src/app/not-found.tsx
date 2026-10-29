import { AccessDenied } from "@/components/shell/access-denied";

/**
 * What a visitor sees at an address no page answers, such as a bookmarked per-creator Content
 * Plan, which the Creator Detail page replaced. The same card as a refused page: what happened
 * and the one way on, with no app frame, as whoever lands here may not be signed in.
 */
export default function NotFound() {
  return (
    <AccessDenied
      title="Halaman tidak ditemukan"
      reason="Alamat ini tidak ada atau sudah dipindahkan. Periksa lagi tautannya."
      home="/admin/creators"
      homeLabel="Kembali ke Creator Database"
    />
  );
}
