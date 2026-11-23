import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PreviousPeriod } from "@/lib/contract-extension";
import type { CreatorPeriod } from "@/lib/creator-detail";
import { ExtendContractModal } from "./extend-contract-modal";

// The current period runs to the end of 2026; today is 19 Nov 2026 in Jakarta.
const PREVIOUS: PreviousPeriod = {
  status: "active",
  type: "probation",
  endDate: "2026-12-31",
  daysBetween: 14,
  fixedRate: 2_500_000,
  earlyEndReason: null,
};

function renderModal(props: Partial<Parameters<typeof ExtendContractModal>[0]> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(
    <ExtendContractModal
      creatorName="Rani Kusuma"
      previous={PREVIOUS}
      periodNumber={2}
      onClose={onClose}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onSubmit, onClose };
}

function fill({ end = "2027-03-31", quota = "6" } = {}) {
  fireEvent.change(screen.getByLabelText(/akhir kontrak/i), { target: { value: end } });
  fireEvent.change(screen.getByLabelText(/jumlah konten/i), { target: { value: quota } });
}

function extendButton() {
  return screen.getByRole("button", { name: "Perpanjang Kontrak" });
}

describe("ExtendContractModal", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T05:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("names the creator whose contract is extended, as the prototype titles it", () => {
    renderModal();

    expect(screen.getByRole("dialog", { name: "Perpanjang Kontrak — Rani Kusuma" })).toBeInTheDocument();
  });

  // AC 2: start the day after the current end, the previous rate; the rest as Tambah Creator asks.
  it("opens with the day after the current end, the previous rate and interval", () => {
    renderModal();

    expect(screen.getByLabelText(/mulai kontrak/i)).toHaveValue("2027-01-01");
    expect(screen.getByLabelText(/akhir kontrak/i)).toHaveValue("");
    expect(screen.getByLabelText(/fixed rate/i)).toHaveValue("2.500.000");
    expect(screen.getByLabelText(/jarak antar-deadline/i)).toHaveValue("14");
    expect(screen.getByLabelText(/jumlah konten/i)).toHaveValue("");
    expect(screen.getByLabelText(/jenis kontrak/i)).toHaveValue("regular");
  });

  it("asks for the contract's terms only: who the creator is does not change", () => {
    renderModal();

    expect(screen.queryByLabelText(/nama creator/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^email/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
  });

  it("keeps Perpanjang Kontrak disabled until the end and the quota are filled in", () => {
    renderModal();

    expect(extendButton()).toBeDisabled();
    fill();
    expect(extendButton()).toBeEnabled();
  });

  it("says a start on the current end overlaps it, and keeps the button disabled", () => {
    renderModal();
    fill();

    fireEvent.change(screen.getByLabelText(/mulai kontrak/i), { target: { value: "2026-12-31" } });

    expect(screen.getByText("Tanggal mulai harus setelah akhir kontrak sebelumnya (31 Des 2026)")).toBeInTheDocument();
    expect(extendButton()).toBeDisabled();
  });

  it("keeps the button disabled when the previous rate is cleared and not filled in again", () => {
    renderModal();
    fill();

    const rate = screen.getByLabelText(/fixed rate/i);
    fireEvent.change(rate, { target: { value: "" } });
    fireEvent.blur(rate);

    expect(screen.getByText("Fixed rate wajib diisi")).toBeInTheDocument();
    expect(extendButton()).toBeDisabled();
  });

  it("keeps the button disabled while a content has no deadline yet", () => {
    renderModal();
    // Six contents every 14 days cannot fit in two weeks: some are left for the admin to place.
    fill({ end: "2027-01-20", quota: "6" });

    expect(screen.getByRole("status")).toHaveTextContent(/belum punya deadline/);
    expect(extendButton()).toBeDisabled();
  });

  // AC 3: a confirmation summarises the new period before anything is saved.
  it("summarises the new period in a confirmation before saving it", () => {
    const { onSubmit } = renderModal();
    fill();

    fireEvent.click(extendButton());

    const confirm = screen.getByRole("alertdialog", { name: "Perpanjang kontrak?" });
    expect(confirm).toHaveTextContent("Kontrak dan invoice periode sebelumnya tidak berubah.");
    expect(within(confirm).getByText("Rani Kusuma")).toBeInTheDocument();
    expect(within(confirm).getByText("Periode 2")).toBeInTheDocument();
    expect(within(confirm).getByText("1 Jan – 31 Mar 2027")).toBeInTheDocument();
    expect(within(confirm).getByText("Regular")).toBeInTheDocument();
    expect(within(confirm).getByText("6 konten, tiap 14 hari")).toBeInTheDocument();
    expect(within(confirm).getByText("Rp2.500.000")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("saves the period and its six deadlines once the admin confirms", () => {
    const { onSubmit } = renderModal();
    fill();

    fireEvent.click(extendButton());
    fireEvent.click(screen.getByRole("button", { name: "Perpanjang" }));

    expect(onSubmit).toHaveBeenCalledWith({
      contractStart: "2027-01-01",
      contractEnd: "2027-03-31",
      interval: 14,
      quota: 6,
      fixedRate: 2_500_000,
      contractType: "regular",
      deadlines: ["2027-01-06", "2027-01-20", "2027-02-03", "2027-02-17", "2027-03-03", "2027-03-17"],
    });
  });

  it("goes back to the form, nothing saved, when the confirmation is cancelled", () => {
    const { onSubmit } = renderModal();
    fill();

    fireEvent.click(extendButton());
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/akhir kontrak/i)).toHaveValue("2027-03-31");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ["Fraud", "fraud", "Kontrak sebelumnya diakhiri lebih awal karena Fraud."],
    ["Pelanggaran Kontrak", "violation", "Kontrak sebelumnya diakhiri lebih awal karena Pelanggaran Kontrak."],
  ] as const)("warns in the confirmation when the previous contract ended for %s (AC 3)", (_label, reason, warning) => {
    renderModal({ previous: { ...PREVIOUS, status: "expired", endDate: "2026-11-10", earlyEndReason: reason } });
    fill();

    fireEvent.click(extendButton());

    expect(screen.getByRole("alertdialog")).toHaveTextContent(warning);
  });

  it("does not warn for a contract ended early for another reason", () => {
    renderModal({ previous: { ...PREVIOUS, status: "expired", endDate: "2026-11-10", earlyEndReason: "other" } });
    fill();

    fireEvent.click(extendButton());

    expect(screen.getByRole("alertdialog")).not.toHaveTextContent("diakhiri lebih awal");
  });

  it("disables the button while the period is being saved", () => {
    renderModal({ loading: true });
    fill();

    expect(extendButton()).toBeDisabled();
  });

  it("shows the server's message under the field it refused, until that field changes", () => {
    renderModal({ serverErrors: { contractEnd: "Akhir kontrak bertabrakan dengan periode lain" } });

    expect(screen.getByText("Akhir kontrak bertabrakan dengan periode lain")).toBeInTheDocument();
    fill();
    expect(screen.queryByText("Akhir kontrak bertabrakan dengan periode lain")).not.toBeInTheDocument();
  });

  it("shows the server's next answer even under a field edited after its last one", () => {
    const props = {
      creatorName: "Rani Kusuma",
      previous: PREVIOUS,
      periodNumber: 2,
      onClose: vi.fn(),
      onSubmit: vi.fn(),
    };
    const { rerender } = render(
      <ExtendContractModal {...props} serverErrors={{ contractEnd: "Akhir kontrak bertabrakan dengan periode lain" }} />,
    );
    fill();

    rerender(<ExtendContractModal {...props} serverErrors={{ contractEnd: "Akhir kontrak melewati batas" }} />);

    expect(screen.getByText("Akhir kontrak melewati batas")).toBeInTheDocument();
  });

  it("shows a failure that belongs to no field as an alert", () => {
    renderModal({ formError: "Periode gagal disimpan. Coba lagi." });

    expect(screen.getByRole("alert")).toHaveTextContent("Periode gagal disimpan. Coba lagi.");
  });

  it("closes at once while nothing was changed", () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("asks before throwing away what was filled in", () => {
    const { onClose } = renderModal();
    fill();

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.getByRole("alertdialog", { name: "Batalkan perpanjangan kontrak?" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

// AC 8: while a renewal is "Belum Dimulai", the same form changes it, opened on its own terms.
describe("ExtendContractModal changing a period that has not started", () => {
  const UPCOMING: CreatorPeriod = {
    contractId: "33333333-3333-4333-8333-333333333333",
    periodNumber: 2,
    type: "regular",
    startDate: "2027-01-01",
    endDate: "2027-03-31",
    status: "upcoming",
    contentQuota: 6,
    evergreenCount: 6,
    remainingEvergreenQuota: 0,
    daysBetween: 14,
    fixedRate: 3_000_000,
    earlyEndReason: null,
    progress: { submitted: 0, total: 6, percent: 0 },
    performance: { onTimeRate: null, avgRevisions: 0, productivity: "no_data", productivityLabel: "Belum Ada Data" },
  };

  function renderEdit(previous: PreviousPeriod = PREVIOUS) {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <ExtendContractModal
        creatorName="Rani Kusuma"
        previous={previous}
        periodNumber={UPCOMING.periodNumber}
        editing={UPCOMING}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );
    return { onSubmit, onClose };
  }

  function saveButton() {
    return screen.getByRole("button", { name: "Simpan Perubahan" });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T05:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("names the period it changes", () => {
    renderEdit();

    expect(screen.getByRole("dialog", { name: "Ubah Periode 2 — Rani Kusuma" })).toBeInTheDocument();
  });

  it("opens on the period's own terms, ready to save", () => {
    renderEdit();

    expect(screen.getByLabelText(/mulai kontrak/i)).toHaveValue("2027-01-01");
    expect(screen.getByLabelText(/akhir kontrak/i)).toHaveValue("2027-03-31");
    expect(screen.getByLabelText(/fixed rate/i)).toHaveValue("3.000.000");
    expect(screen.getByLabelText(/jumlah konten/i)).toHaveValue("6");
    expect(screen.getByLabelText(/jarak antar-deadline/i)).toHaveValue("14");
    expect(screen.getByLabelText(/jenis kontrak/i)).toHaveValue("regular");
    expect(saveButton()).toBeEnabled();
  });

  it("still refuses a start on the end of the period before it", () => {
    renderEdit();

    fireEvent.change(screen.getByLabelText(/mulai kontrak/i), { target: { value: "2026-12-31" } });

    expect(screen.getByText("Tanggal mulai harus setelah akhir kontrak sebelumnya (31 Des 2026)")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("confirms that the schedule is generated again, then saves the changed terms", () => {
    const { onSubmit } = renderEdit();
    fireEvent.change(screen.getByLabelText(/jumlah konten/i), { target: { value: "2" } });

    fireEvent.click(saveButton());
    const confirm = screen.getByRole("alertdialog", { name: "Simpan perubahan periode?" });
    expect(confirm).toHaveTextContent("Jadwal Evergreen periode ini di-generate ulang.");
    fireEvent.click(within(confirm).getByRole("button", { name: "Simpan" }));

    expect(onSubmit).toHaveBeenCalledWith({
      contractStart: "2027-01-01",
      contractEnd: "2027-03-31",
      interval: 14,
      quota: 2,
      fixedRate: 3_000_000,
      contractType: "regular",
      deadlines: ["2027-01-06", "2027-01-20"],
    });
  });

  // The warning is about renewing a creator ended for cause; that choice was already made.
  it("does not repeat the early-end warning when only changing the period", () => {
    renderEdit({ ...PREVIOUS, status: "expired", endDate: "2026-11-10", earlyEndReason: "fraud" });

    fireEvent.click(saveButton());

    expect(screen.getByRole("alertdialog")).not.toHaveTextContent("diakhiri lebih awal");
  });

  it("closes at once while nothing was changed, and asks once something was", () => {
    const { onClose } = renderEdit();

    fireEvent.change(screen.getByLabelText(/jumlah konten/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.getByRole("alertdialog", { name: "Batalkan perubahan periode?" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
