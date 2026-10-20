import type { PaymentProof } from "@/lib/invoice-payment-api";

// The payment proof by its file name (PBI-13, subtask 13.4): a link that opens it in a new tab,
// with no way back into the panel (noopener) and no address sent along (noreferrer), as the
// prototype's Lihat Bukti opens it; or the name alone when the adapter offered no safe link.
export function ProofLink({ proof }: Readonly<{ proof: PaymentProof }>) {
  if (proof.href === null) return <span className="break-all">{proof.fileName}</span>;

  return (
    <a
      href={proof.href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-rule underline-offset-[3px] hover:decoration-ink"
    >
      {proof.fileName}
    </a>
  );
}
