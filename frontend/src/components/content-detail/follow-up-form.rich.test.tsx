import { fireEvent, render, screen } from "@testing-library/react";
import { FollowUpForm } from "./follow-up-form";

// PBI-33 AC 2: a follow-up is written in the same editor as the revision note (PBI-34), with
// the same formatting toolbar, rather than in a plain textarea.
describe("FollowUpForm with the revision note's editor", () => {
  it("opens into the rich text editor with its formatting toolbar", () => {
    render(
      <FollowUpForm
        submissionId="22222222-2222-2222-2222-222222222222"
        add={vi.fn()}
        onAdded={vi.fn()}
        onRoundClosed={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tambah Catatan Susulan" }));

    for (const tool of ["Tebal", "Miring", "Daftar poin", "Daftar nomor", "Tambah link"]) {
      expect(screen.getByRole("button", { name: tool })).toBeInTheDocument();
    }
    expect(screen.getByRole("textbox", { name: "Catatan susulan" })).toHaveAttribute(
      "contenteditable",
      "true",
    );
  });
});
