import Link from "next/link";
import { Panel } from "@/components/ui/panel";

export const metadata = {
  title: "Kebijakan Privasi — Tofly",
};

const SECTION = "mt-6 text-[15px]";
const BODY = "mt-2 text-[13px] leading-relaxed text-ink-2";

/**
 * The privacy policy Google links from its consent screen (Google Auth Platform → Branding).
 * Public like /login, and limited to what the app actually does: no retention periods,
 * company details or promises the product has not made.
 */
export default function PrivacyPage() {
  return (
    <main className="flex flex-1 justify-center px-4 py-10">
      <div className="w-full max-w-[640px]">
        <Panel>
          <article className="px-6 py-7">
            <p className="text-[12.5px] font-semibold text-accent">Tofly</p>
            <h1 className="mt-1 text-[20px]">Kebijakan Privasi Tofly</h1>
            <p className={BODY}>
              Tofly adalah aplikasi internal untuk mengelola kerja sama konten dengan creator. Halaman
              ini menjelaskan data apa yang dipakai aplikasi dan untuk apa.
            </p>

            <h2 className={SECTION}>Data dari akun Google</h2>
            <p className={BODY}>
              Saat Anda masuk dengan Google, Tofly hanya meminta alamat email akun Google Anda. Email
              itu dicocokkan dengan daftar akses yang dibuat Admin untuk menentukan apakah Anda boleh
              masuk dan sebagai apa. Tofly tidak pernah menerima kata sandi Google Anda.
            </p>

            <h2 className={SECTION}>Data yang dikelola Admin</h2>
            <p className={BODY}>
              Untuk creator, Admin mencatat nama, nomor telepon, akun Instagram atau TikTok, serta
              detail kontrak. Tofly juga menyimpan konten yang dijadwalkan, tautan draf dan video yang
              Anda kirim, serta data performa konten. Data ini dipakai untuk menjadwalkan, meninjau, dan
              mencatat pekerjaan konten.
            </p>

            <h2 className={SECTION}>Cookie</h2>
            <p className={BODY}>
              Tofly memakai cookie yang tidak dapat dibaca oleh skrip halaman: satu untuk menyelesaikan
              proses masuk dengan Google, dan satu untuk menjaga sesi Anda tetap aktif sampai Anda
              keluar. Tofly tidak memakai cookie iklan atau pelacakan.
            </p>

            <h2 className={SECTION}>Siapa yang dapat melihat data</h2>
            <p className={BODY}>
              Admin dapat melihat data semua creator. Creator hanya dapat melihat data miliknya sendiri.
              Data disimpan di layanan cloud yang digunakan Tofly (Google Cloud).
            </p>

            <h2 className={SECTION}>Pertanyaan dan penghapusan data</h2>
            <p className={BODY}>
              Untuk pertanyaan, koreksi, atau permintaan penghapusan data, hubungi Admin Tofly yang
              mendaftarkan akun Anda. Admin juga dapat mencabut akses Anda kapan saja.
            </p>

            <p className="mt-7 text-[13px]">
              <Link
                href="/login"
                className="font-semibold text-accent-deep underline underline-offset-2 hover:text-accent"
              >
                Kembali ke halaman masuk
              </Link>
            </p>
          </article>
        </Panel>
      </div>
    </main>
  );
}
