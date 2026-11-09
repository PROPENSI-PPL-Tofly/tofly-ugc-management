import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FollowUp } from "@/lib/content-detail";
import { DecisionError } from "@/lib/decisions";
import { MAX_FOLLOW_UP_LENGTH } from "@/lib/follow-ups";
import { FollowUpForm } from "./follow-up-form";

const SUBMISSION = "22222222-2222-2222-2222-222222222222";
const SAVED: FollowUp = {
  id: "f1",
  note: "Logo di detik 3.",
  at: "2026-11-09T04:00:00.000Z",
  actor: { name: "Bastian" },
};

function setup(add = vi.fn().mockResolvedValue(SAVED)) {
  const onAdded = vi.fn();
  const onRoundClosed = vi.fn();
  render(
    <FollowUpForm
      submissionId={SUBMISSION}
      add={add}
      onAdded={onAdded}
      onRoundClosed={onRoundClosed}
    />,
  );
  return { add, onAdded, onRoundClosed };
}

const opener = () => screen.getByRole("button", { name: "Tambah Catatan Susulan" });
const field = () => screen.getByRole("textbox", { name: "Catatan susulan" });
const send = () => screen.getByRole("button", { name: "Kirim Catatan Susulan" });

function openAndType(value: string) {
  fireEvent.click(opener());
  fireEvent.change(field(), { target: { value } });
}

describe("FollowUpForm", () => {
  it("starts closed behind Tambah Catatan Susulan and opens into the shared note field", () => {
    setup();

    expect(opener()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.click(opener());

    expect(field()).toBeRequired();
    expect(field()).toHaveFocus();
    expect(field()).toHaveAttribute("maxLength", String(MAX_FOLLOW_UP_LENGTH));
    expect(screen.getByText(`0/${MAX_FOLLOW_UP_LENGTH}`)).toBeInTheDocument();
    // While open, the form's own buttons replace the opener.
    expect(screen.queryByRole("button", { name: "Tambah Catatan Susulan" })).toBeNull();
  });

  it("keeps Kirim unavailable until the note has a character that is not a space", () => {
    setup();
    fireEvent.click(opener());

    expect(send()).toBeDisabled();
    fireEvent.change(field(), { target: { value: "   \n " } });
    expect(send()).toBeDisabled();
    fireEvent.change(field(), { target: { value: "a" } });
    expect(send()).toBeEnabled();
  });

  it("accepts a note of exactly the limit and says the field is full", () => {
    setup();
    openAndType("x".repeat(MAX_FOLLOW_UP_LENGTH));

    expect(send()).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(`Maksimal ${MAX_FOLLOW_UP_LENGTH} karakter`);
  });

  it("sends the trimmed note for the round, then closes, lists it, confirms and hands focus back", async () => {
    const { add, onAdded } = setup();
    openAndType("  Logo di detik 3.  ");

    fireEvent.click(send());

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(SAVED));
    expect(add).toHaveBeenCalledWith(SUBMISSION, "Logo di detik 3.");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Catatan susulan terkirim ke kreator.");
    expect(opener()).toHaveFocus();

    // A second follow-up starts from an empty field.
    fireEvent.click(opener());
    expect(field()).toHaveValue("");
  });

  it("locks the form and marks Kirim busy while the note is on its way", async () => {
    let finish!: (saved: FollowUp) => void;
    setup(vi.fn(() => new Promise<FollowUp>((resolve) => (finish = resolve))));
    openAndType("Logo");

    fireEvent.click(send());

    expect(send()).toHaveAttribute("aria-busy", "true");
    expect(send()).toBeDisabled();
    expect(field()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Batal" })).toBeDisabled();

    await act(async () => finish(SAVED));
  });

  it("keeps the note and says why when the backend refuses it", async () => {
    const { onAdded, onRoundClosed } = setup(
      vi.fn().mockRejectedValue(new DecisionError(422, "Catatan susulan maksimal 1000 karakter")),
    );
    openAndType("Logo");

    fireEvent.click(send());

    expect(await screen.findByRole("alert")).toHaveTextContent("Catatan susulan maksimal 1000 karakter");
    expect(field()).toHaveValue("Logo");
    expect(field()).toBeEnabled();
    expect(onAdded).not.toHaveBeenCalled();
    expect(onRoundClosed).not.toHaveBeenCalled();
  });

  it("falls back to a general message when the failure is not one it can word", async () => {
    setup(vi.fn().mockRejectedValue("network down"));
    openAndType("Logo");

    fireEvent.click(send());

    expect(await screen.findByRole("alert")).toHaveTextContent("Terjadi kesalahan. Coba lagi.");
  });

  it("hands a closed round over to the panel, which reads the content again", async () => {
    const { onRoundClosed } = setup(
      vi.fn().mockRejectedValue(new DecisionError(409, "Creator sudah mengirim draft baru")),
    );
    openAndType("Logo");

    fireEvent.click(send());

    await waitFor(() => expect(onRoundClosed).toHaveBeenCalledWith("Creator sudah mengirim draft baru"));
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("drops the note on Batal and gives focus back to the opener", () => {
    setup();
    openAndType("Setengah jadi");

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(opener()).toHaveFocus();
    fireEvent.click(opener());
    expect(field()).toHaveValue("");
  });
});
