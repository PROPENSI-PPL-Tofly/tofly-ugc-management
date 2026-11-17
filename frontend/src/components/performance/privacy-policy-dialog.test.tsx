import { fireEvent, render, screen, within } from "@testing-library/react";
import { PrivacyPolicyDialog } from "./privacy-policy-dialog";

function renderDialog(onClose = vi.fn()) {
  render(<PrivacyPolicyDialog onClose={onClose} />);
  return { dialog: screen.getByRole("dialog", { name: "Kebijakan Privasi" }), onClose };
}

describe("PrivacyPolicyDialog", () => {
  // PRD 19 AC 15, worded as the Sprint 3 prototype's pop-up (#s3Privacy): what is pulled, why,
  // what Tofly never does, and how to stop it.
  it.each([
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
  ])("says %s as the prototype words it", (heading, body) => {
    const { dialog } = renderDialog();

    const paragraph = within(dialog).getByText(heading, { selector: "b" }).closest("p");
    expect(paragraph).toHaveTextContent(`${heading} ${body}`, { normalizeWhitespace: true });
  });

  it("has the four paragraphs in the prototype's order", () => {
    const { dialog } = renderDialog();

    expect(within(dialog).getAllByText(/\.$/, { selector: "b" }).map((b) => b.textContent)).toEqual([
      "Data yang diambil.",
      "Dipakai untuk apa.",
      "Yang tidak kami lakukan.",
      "Memutus akses.",
    ]);
  });

  it("closes with Mengerti", () => {
    const { dialog, onClose } = renderDialog();

    fireEvent.click(within(dialog).getByRole("button", { name: "Mengerti" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("draws Mengerti as the main button, as the prototype does", () => {
    const { dialog } = renderDialog();

    expect(within(dialog).getByRole("button", { name: "Mengerti" })).toHaveClass("bg-accent");
  });
});
