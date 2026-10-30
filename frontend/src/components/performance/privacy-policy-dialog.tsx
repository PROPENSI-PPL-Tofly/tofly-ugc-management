"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/** What the pop-up says, worded as the Sprint 3 prototype's #s3Privacy (PRD 19 AC 15). */
const SECTIONS = [
  [
    "Data yang diambil.",
    "Username, daftar konten, dan angka performa (views, likes, comments, shares) dari akun Instagram Professional dan TikTok yang kamu hubungkan.",
  ],
  ["Dipakai untuk apa.", "Menampilkan performa kontenmu dan menghitung bonus performa di invoice."],
  [
    "Yang tidak kami lakukan.",
    "Tofly tidak memposting, mengubah, atau menghapus apa pun di akunmu, dan tidak membagikan datamu ke pihak lain.",
  ],
  [
    "Memutus akses.",
    "Kamu bisa klik Putuskan kapan saja. Angka yang sudah tersimpan tetap ada untuk keperluan invoice, tapi tidak diperbarui lagi.",
  ],
] as const;

/**
 * The Kebijakan Privasi pop-up on the Performa page: what connecting an account gives Tofly, in
 * the creator's own words. The public /privasi page says the same for everyone, formally.
 */
export function PrivacyPolicyDialog({ onClose }: Readonly<{ onClose: () => void }>) {
  return (
    <Modal
      title="Kebijakan Privasi"
      onClose={onClose}
      footer={
        <Button type="button" variant="accent" onClick={onClose}>
          Mengerti
        </Button>
      }
    >
      <div className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-ink-2">
        {SECTIONS.map(([heading, body]) => (
          <p key={heading}>
            <b className="text-ink">{heading}</b> {body}
          </p>
        ))}
      </div>
    </Modal>
  );
}
