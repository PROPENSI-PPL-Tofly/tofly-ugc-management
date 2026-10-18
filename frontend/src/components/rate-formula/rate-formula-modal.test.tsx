import { fireEvent, render, screen, within } from "@testing-library/react";
import { draftFromView, type RateFormulaDraft, type RateFormulaErrors } from "@/lib/rate-formula";
import { SAVED_FORMULA, UNCONFIGURED_FORMULA } from "@/lib/rate-formula.fixture";
import { RateFormulaModal } from "./rate-formula-modal";

const SAVED = draftFromView(SAVED_FORMULA);
const BLANK = draftFromView(UNCONFIGURED_FORMULA);

function setup(
  props: {
    initial?: RateFormulaDraft;
    loading?: boolean;
    serverErrors?: RateFormulaErrors;
    formError?: string;
  } = {},
) {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  render(<RateFormulaModal initial={SAVED} onClose={onClose} onSubmit={onSubmit} {...props} />);
  return { onClose, onSubmit };
}

const simpan = () => screen.getByRole("button", { name: "Simpan" });
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("RateFormulaModal", () => {
  it("shows the three amounts and a card per platform, filled from what is saved", () => {
    setup();

    expect(screen.getByRole("dialog", { name: "Atur Formula Rate" })).toBeInTheDocument();
    expect(screen.getByLabelText("Penalti per Hari (Rp)*")).toHaveValue("50000");
    expect(screen.getByLabelText("Maks Hari Penalti*")).toHaveValue("3");
    expect(screen.getByLabelText("Bonus Specific (Rp)*")).toHaveValue("100000");
    expect(screen.getByRole("group", { name: "Bonus performa Instagram" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Bonus performa TikTok" })).toBeInTheDocument();
  });

  it("explains each amount and the bonus section behind an ⓘ", () => {
    setup();

    const tips = screen.getAllByRole("tooltip").map((tip) => tip.textContent);

    expect(tips).toEqual([
      "Per konten Evergreen yang telat.",
      "Penalti per konten berhenti di hari ini. Contoh: Rp15.000 × maks 3 hari = Rp45.000.",
      "Per konten Specific yang selesai tepat waktu.",
      "Berlaku untuk semua creator, diatur per platform. Dipakai tier tertinggi yang tercapai. Maks 5 tier.",
    ]);
  });

  it("marks every amount as required", () => {
    setup();

    for (const label of ["Penalti per Hari (Rp)*", "Maks Hari Penalti*", "Bonus Specific (Rp)*"]) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
  });

  it("opens blank, with Simpan disabled and no message yet, when nothing is saved", () => {
    setup({ initial: BLANK });

    expect(screen.getByLabelText("Penalti per Hari (Rp)*")).toHaveValue("");
    expect(simpan()).toBeDisabled();
    expect(screen.queryByText(/wajib diisi/)).not.toBeInTheDocument();
  });

  it("keeps Simpan enabled for a formula that is valid as saved", () => {
    setup();

    expect(simpan()).toBeEnabled();
  });

  it("hands the formula to onSubmit with the tiers in order", () => {
    const { onSubmit } = setup();

    type("Penalti per Hari (Rp)*", "75000");
    fireEvent.click(simpan());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      latePenaltyPerDay: 75000,
      maxPenaltyDays: 3,
      specificBonus: 100000,
      performanceBonus: {
        instagram: {
          metric: "views",
          tiers: [
            { threshold: 10000, bonus: 150000 },
            { threshold: 40000, bonus: 400000 },
          ],
        },
        tiktok: { metric: "likes", tiers: [{ threshold: 500, bonus: 50000 }] },
      },
    });
  });

  it("accepts 0 for an amount", () => {
    setup();

    type("Bonus Specific (Rp)*", "0");

    expect(screen.getByLabelText("Bonus Specific (Rp)*")).toHaveValue("0");
    expect(simpan()).toBeEnabled();
  });

  it("keeps an amount past ten digits as typed and refuses it out loud", () => {
    setup();

    type("Bonus Specific (Rp)*", "123456789012");
    fireEvent.blur(screen.getByLabelText("Bonus Specific (Rp)*"));

    expect(screen.getByLabelText("Bonus Specific (Rp)*")).toHaveValue("123456789012");
    expect(screen.getByText("Bonus Specific maksimal 10 digit")).toBeInTheDocument();
    expect(simpan()).toBeDisabled();
  });

  it("keeps a minus sign as typed and asks for a whole number", () => {
    setup();

    type("Penalti per Hari (Rp)*", "-5");
    fireEvent.blur(screen.getByLabelText("Penalti per Hari (Rp)*"));

    expect(screen.getByLabelText("Penalti per Hari (Rp)*")).toHaveValue("-5");
    expect(screen.getByText("Penalti per hari harus berupa angka bulat")).toBeInTheDocument();
    expect(simpan()).toBeDisabled();
  });

  it("shows a message below an amount once it is left empty, and disables Simpan", () => {
    setup();

    type("Bonus Specific (Rp)*", "");
    fireEvent.blur(screen.getByLabelText("Bonus Specific (Rp)*"));

    expect(screen.getByText("Bonus Specific wajib diisi")).toBeInTheDocument();
    expect(screen.getByLabelText("Bonus Specific (Rp)*")).toHaveAccessibleDescription(
      "Bonus Specific wajib diisi",
    );
    expect(simpan()).toBeDisabled();
  });

  it("rejects a day cap above 365 right below the field, and disables Simpan", () => {
    setup();

    type("Maks Hari Penalti*", "1000");
    fireEvent.blur(screen.getByLabelText("Maks Hari Penalti*"));

    expect(screen.getByLabelText("Maks Hari Penalti*")).toHaveAccessibleDescription(
      "Maks hari penalti harus antara 0 hari dan 365 hari",
    );
    expect(simpan()).toBeDisabled();
  });

  it("accepts a day cap of exactly 365", () => {
    setup();

    type("Maks Hari Penalti*", "365");

    expect(simpan()).toBeEnabled();
  });

  it("does not show a message for an amount the admin has not left yet", () => {
    setup();

    type("Bonus Specific (Rp)*", "");

    expect(screen.queryByText("Bonus Specific wajib diisi")).not.toBeInTheDocument();
    expect(simpan()).toBeDisabled();
  });

  it("shows the tier message as soon as a metric change empties a platform's tiers", () => {
    setup();
    const instagram = within(screen.getByRole("group", { name: "Bonus performa Instagram" }));

    fireEvent.change(instagram.getByLabelText(/metrik/i), { target: { value: "shares" } });

    expect(instagram.getByText("Minimum dan bonus harus lebih dari 0.")).toBeInTheDocument();
    expect(instagram.getByText("1/5 tier")).toBeInTheDocument();
    expect(simpan()).toBeDisabled();
  });

  it("clears the tier message once the tiers are filled in", () => {
    setup();
    const instagram = within(screen.getByRole("group", { name: "Bonus performa Instagram" }));
    fireEvent.change(instagram.getByLabelText(/metrik/i), { target: { value: "shares" } });

    type("Instagram tier 1 minimum Shares", "100");
    type("Instagram tier 1 bonus (Rp)", "25000");

    expect(screen.queryByText("Minimum dan bonus harus lebih dari 0.")).not.toBeInTheDocument();
    expect(simpan()).toBeEnabled();
  });

  it("rejects a bonus that does not rise with the minimum", () => {
    setup();

    type("Instagram tier 2 bonus (Rp)", "100000");

    expect(screen.getByText("Bonus harus naik seiring minimum.")).toBeInTheDocument();
    expect(simpan()).toBeDisabled();
  });

  it("keeps the two platforms' tiers apart", () => {
    setup();

    type("TikTok tier 1 bonus (Rp)", "75000");

    expect(screen.getByLabelText("Instagram tier 1 bonus (Rp)")).toHaveValue("150000");
    expect(screen.getByLabelText("TikTok tier 1 bonus (Rp)")).toHaveValue("75000");
  });

  it("adds and removes tiers", () => {
    setup();
    const tiktok = within(screen.getByRole("group", { name: "Bonus performa TikTok" }));

    fireEvent.click(tiktok.getByRole("button", { name: "+ Tambah Tier" }));
    expect(tiktok.getByText("2/5 tier")).toBeInTheDocument();

    fireEvent.click(tiktok.getByRole("button", { name: "Hapus TikTok tier 2" }));
    expect(tiktok.getByText("1/5 tier")).toBeInTheDocument();
  });

  it("asks for at least one tier when the last one is removed", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: "Hapus TikTok tier 1" }));

    expect(screen.getByText("Minimal 1 tier.")).toBeInTheDocument();
    expect(simpan()).toBeDisabled();
  });

  it("shows the server's message under the amount it rejected", () => {
    setup({ serverErrors: { specificBonus: "Bonus Specific harus antara Rp0 dan Rp10.000.000" } });

    expect(screen.getByLabelText("Bonus Specific (Rp)*")).toHaveAccessibleDescription(
      "Bonus Specific harus antara Rp0 dan Rp10.000.000",
    );
  });

  it("shows the server's message under a platform's tiers", () => {
    setup({ serverErrors: { "performanceBonus.tiktok": "Metrik wajib dipilih" } });

    expect(screen.getByText("Metrik wajib dipilih")).toBeInTheDocument();
  });

  it("drops the server's message for a field once it is edited", () => {
    setup({ serverErrors: { specificBonus: "Bonus Specific harus antara Rp0 dan Rp10.000.000" } });

    type("Bonus Specific (Rp)*", "5000");

    expect(screen.queryByText(/harus antara/)).not.toBeInTheDocument();
  });

  it("shows a failure that belongs to no field as an alert", () => {
    setup({ formError: "Formula rate gagal disimpan. Coba lagi." });

    expect(screen.getByRole("alert")).toHaveTextContent("Formula rate gagal disimpan. Coba lagi.");
  });

  it("disables Simpan while a save is in flight", () => {
    setup({ loading: true });

    expect(simpan()).toBeDisabled();
  });

  it("closes at once on Batal when nothing was changed", () => {
    const { onClose } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("asks before closing once something was changed, and keeps the form on Lanjut mengisi", () => {
    const { onClose } = setup();
    type("Bonus Specific (Rp)*", "5000");

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.getByRole("alertdialog", { name: "Batalkan perubahan formula?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lanjut mengisi" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Bonus Specific (Rp)*")).toHaveValue("5000");
  });

  it("closes once the discard is confirmed", () => {
    const { onClose } = setup();
    type("Bonus Specific (Rp)*", "5000");

    fireEvent.click(screen.getByRole("button", { name: "Tutup dialog" }));
    fireEvent.click(screen.getByRole("button", { name: "Buang" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
