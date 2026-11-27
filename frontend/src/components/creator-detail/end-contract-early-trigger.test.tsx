import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { CreatorPeriod } from "@/lib/creator-detail";
import type { EarlyEndPlan, EarlyEndResult } from "@/lib/early-end-api";
import { EndContractEarlyTrigger } from "./end-contract-early-trigger";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));

// The API is stubbed: early-end-api.test covers the requests themselves.
const previewEarlyEnd = vi.fn<(...args: unknown[]) => Promise<EarlyEndResult>>();
const endContractEarly = vi.fn<(...args: unknown[]) => Promise<EarlyEndResult>>();
vi.mock("@/lib/early-end-api", () => ({
  previewEarlyEnd: (...args: unknown[]) => previewEarlyEnd(...args),
  endContractEarly: (...args: unknown[]) => endContractEarly(...args),
}));

const CREATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUNNING = "22222222-2222-4222-8222-222222222222";
const WAITING = "33333333-3333-4333-8333-333333333333";

function period(overrides: Partial<CreatorPeriod> = {}): CreatorPeriod {
  return {
    contractId: RUNNING,
    periodNumber: 1,
    type: "regular",
    startDate: "2026-09-01",
    endDate: "2026-12-15",
    status: "active",
    contentQuota: 6,
    evergreenCount: 6,
    remainingEvergreenQuota: 0,
    daysBetween: 14,
    fixedRate: 2_500_000,
    earlyEndReason: null,
    progress: { submitted: 0, total: 6, percent: 0 },
    performance: { onTimeRate: null, avgRevisions: 0, productivity: "no_data", productivityLabel: "Belum Ada Data" },
    ...overrides,
  };
}

const NEXT = period({
  contractId: WAITING,
  periodNumber: 2,
  status: "upcoming",
  startDate: "2026-12-16",
  endDate: "2027-03-15",
});

const PLAN: EarlyEndPlan = {
  lastDay: "2026-11-30",
  originalEndDate: "2026-12-15",
  invoice: "pay",
  reasonMismatch: true,
  finalizableFrom: "2026-12-01",
  closing: [{ id: "c-3", name: "Evg_3_Rani", deadline: "2026-12-08" }],
  unfinished: [{ id: "c-2", name: "Evg_2_Rani", deadline: "2026-11-30" }],
  upcomingPeriods: null,
  deletedPeriods: [],
  keptPeriods: [],
  access: "after_invoice_paid",
};

const NOTE = "Konten diunggah ulang dari creator lain.";

function renderTrigger(periods: CreatorPeriod[] = [period()]) {
  render(<EndContractEarlyTrigger creatorId={CREATOR} creatorName="Rani Kusuma" periods={periods} />);
}

function open() {
  fireEvent.click(screen.getByRole("button", { name: "Akhiri Kontrak Lebih Awal" }));
}

function fill({ lastDay = "2026-11-30", reason = "violation", note = NOTE } = {}) {
  fireEvent.change(screen.getByLabelText(/hari terakhir/i), { target: { value: lastDay } });
  fireEvent.change(screen.getByLabelText(/alasan/i), { target: { value: reason } });
  fireEvent.change(screen.getByLabelText(/catatan/i), { target: { value: note } });
}

const next = () => screen.getByRole("button", { name: "Lanjut" });

async function goOn() {
  await act(async () => {
    fireEvent.click(next());
  });
}

async function confirmEnd() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Akhiri Kontrak" }));
  });
}

describe("EndContractEarlyTrigger", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T05:00:00Z"));
    refresh.mockReset();
    previewEarlyEnd.mockReset().mockResolvedValue({ ok: true, plan: PLAN });
    endContractEarly.mockReset().mockResolvedValue({ ok: true, plan: PLAN });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AC 1: only while the contract is active.
  it("offers Akhiri Kontrak Lebih Awal while the contract runs", () => {
    renderTrigger();

    expect(screen.getByRole("button", { name: "Akhiri Kontrak Lebih Awal" })).toBeInTheDocument();
  });

  it.each([
    ["before it starts", [period({ status: "upcoming" })]],
    ["after it ends", [period({ status: "expired" })]],
    ["once it was ended early", [period({ earlyEndReason: "violation" })]],
  ])("offers nothing %s", (_label, periods) => {
    renderTrigger(periods);

    expect(screen.queryByRole("button", { name: "Akhiri Kontrak Lebih Awal" })).not.toBeInTheDocument();
  });

  // QA: the earliest last day followed the browser's clock, so an admin abroad could pick a
  // day Jakarta had already left behind, which the API then refused.
  it("starts the last day at Jakarta's today, whatever time zone the browser is in", () => {
    const zone = process.env.TZ;
    process.env.TZ = "America/New_York";
    vi.setSystemTime(new Date("2026-11-24T18:00:00Z"));
    try {
      renderTrigger();
      open();

      expect(screen.getByLabelText(/hari terakhir/i)).toHaveAttribute("min", "2026-11-25");
    } finally {
      process.env.TZ = zone;
    }
  });

  // QA: why the fixed rate stays whole was only in a tooltip, easy to confirm without reading.
  it("says beside the invoice line that the fixed rate stays whole, in plain sight", async () => {
    renderTrigger();
    open();
    fill();
    await goOn();

    const dialog = screen.getByRole("dialog", { name: /Akhiri Kontrak\?/ });
    expect(within(dialog).getByText("Fixed rate tetap penuh. Potong lewat penyesuaian sebelum finalize.")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "Info Invoice" })).toBeNull();
  });

  // AC 2: the form, "Bayar Sesuai Kontrak" by default.
  it("opens the form on the running period, paying as agreed by default", () => {
    renderTrigger();
    open();

    const dialog = screen.getByRole("dialog", { name: /Akhiri Kontrak Lebih Awal/ });
    expect(within(dialog).getByText(/Periode 1 · .*Kolom bertanda \* wajib diisi\./)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Bayar Sesuai Kontrak/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Batalkan Invoice/ })).not.toBeChecked();
    expect(screen.getByLabelText(/hari terakhir/i)).toHaveAttribute("min", "2026-11-24");
    expect(screen.getByLabelText(/hari terakhir/i)).toHaveAttribute("max", "2026-12-14");
    expect(screen.getByLabelText(/catatan/i)).toHaveAttribute("maxLength", "500");
    expect(screen.getByText("0/500")).toBeInTheDocument();
    expect(next()).toBeDisabled();
  });

  it("names the three reasons as the form lists them", () => {
    renderTrigger();
    open();

    const options = within(screen.getByLabelText(/alasan/i)).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["Pilih alasan", "Pelanggaran Kontrak", "Fraud", "Lainnya"]);
  });

  it("says what is missing once a field has been touched", () => {
    renderTrigger();
    open();

    fireEvent.blur(screen.getByLabelText(/alasan/i));
    fireEvent.change(screen.getByLabelText(/catatan/i), { target: { value: "  " } });

    // The select's placeholder reads "Pilih alasan" too; the message is the span under it.
    expect(screen.getByText("Pilih alasan", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Catatan wajib diisi")).toBeInTheDocument();
    expect(screen.queryByText("Hari terakhir wajib diisi")).not.toBeInTheDocument();
  });

  it("asks for the last day and the note once they lose focus empty", () => {
    renderTrigger();
    open();

    fireEvent.blur(screen.getByLabelText(/hari terakhir/i));
    fireEvent.blur(screen.getByLabelText(/catatan/i));

    expect(screen.getByText("Hari terakhir wajib diisi")).toBeInTheDocument();
    expect(screen.getByText("Catatan wajib diisi")).toBeInTheDocument();
  });

  it("tells the admin to cancel on the original end day, when no day before it is left", () => {
    vi.setSystemTime(new Date("2026-12-15T05:00:00Z"));
    renderTrigger();
    open();

    fill({ lastDay: "2026-12-15" });

    expect(screen.queryByRole("button", { name: "Info Hari Terakhir" })).not.toBeInTheDocument();
    expect(screen.getByText("Tidak ada hari terakhir sebelum kontrak berakhir. Pilih Batalkan Invoice.")).toBeInTheDocument();
  });

  it("puts the server's refusal of the preview under its field", async () => {
    previewEarlyEnd.mockResolvedValue({
      ok: false,
      message: "Data pengakhiran kontrak tidak valid",
      errors: { upcomingPeriods: "Pilih Pertahankan atau Hapus" },
    });
    renderTrigger([NEXT, period()]);
    open();
    fill();
    fireEvent.click(screen.getByRole("radio", { name: /Hapus/ }));
    await goOn();

    expect(screen.getByText("Pilih Pertahankan atau Hapus")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Choosing again clears the server's message.
    fireEvent.click(screen.getByRole("radio", { name: /Pertahankan/ }));
    expect(screen.queryByText("Pilih Pertahankan atau Hapus")).not.toBeInTheDocument();
  });

  it("refuses a last day outside the window in the API's words", () => {
    renderTrigger();
    open();

    fill({ lastDay: "2026-12-15" });

    expect(screen.getByText("Pilih antara 24 Nov 2026 dan 14 Des 2026")).toBeInTheDocument();
    expect(next()).toBeDisabled();
  });

  // AC 4: one confirmation, from the API's plan.
  it("previews the consequences and lists them on one confirmation", async () => {
    renderTrigger();
    open();
    fill();
    await goOn();

    expect(previewEarlyEnd).toHaveBeenCalledWith(CREATOR, RUNNING, {
      invoice: "pay",
      lastDay: "2026-11-30",
      reason: "violation",
      note: NOTE,
    });
    const dialog = screen.getByRole("dialog", { name: /Akhiri Kontrak\?/ });
    expect(within(dialog).getByText("Berakhir 30 Nov 2026 (semula 15 Des 2026)")).toBeInTheDocument();
    expect(within(dialog).getByText("1 konten setelah 30 Nov 2026 ditutup")).toBeInTheDocument();
    expect(within(dialog).getByText("Evg_3_Rani")).toBeInTheDocument();
    expect(within(dialog).getByText("1 konten sampai 30 Nov 2026")).toBeInTheDocument();
    expect(within(dialog).getByText("Bisa difinalisasi mulai 1 Des 2026")).toBeInTheDocument();
    expect(within(dialog).getByText("Ditutup sehari setelah invoice Paid")).toBeInTheDocument();
    expect(within(dialog).getByText("Alasan Pelanggaran Kontrak, tapi invoice tetap dibayar.")).toBeInTheDocument();
    expect(within(dialog).getByText("Tidak bisa dibatalkan setelah dikonfirmasi.")).toBeInTheDocument();
  });

  it("says nothing closes and warns of nothing when the plan says so", async () => {
    previewEarlyEnd.mockResolvedValue({
      ok: true,
      plan: { ...PLAN, closing: [], unfinished: [], reasonMismatch: false },
    });
    renderTrigger();
    open();
    fill({ reason: "fraud" });
    fireEvent.click(screen.getByRole("radio", { name: /Bayar Sesuai Kontrak/ }));
    await goOn();

    expect(screen.getByText("Tidak ada konten yang ditutup")).toBeInTheDocument();
    expect(screen.queryByText(/konten sampai/)).not.toBeInTheDocument();
    expect(screen.queryByText(/tapi invoice tetap dibayar/)).not.toBeInTheDocument();
  });

  // AC 2: cancelling fixes the last day to today.
  it("fixes the last day to today when the invoice is cancelled", async () => {
    previewEarlyEnd.mockResolvedValue({
      ok: true,
      plan: { ...PLAN, invoice: "cancel", lastDay: "2026-11-24", finalizableFrom: null, access: "closed_now", reasonMismatch: false },
    });
    renderTrigger();
    open();

    fireEvent.click(screen.getByRole("radio", { name: /Batalkan Invoice/ }));
    expect(screen.queryByLabelText(/hari terakhir/i)).not.toBeInTheDocument();
    expect(screen.getByText("24 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("Invoice dibatalkan, jadi kontrak berakhir hari ini.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/alasan/i), { target: { value: "fraud" } });
    fireEvent.change(screen.getByLabelText(/catatan/i), { target: { value: NOTE } });
    await goOn();

    expect(previewEarlyEnd).toHaveBeenCalledWith(CREATOR, RUNNING, expect.objectContaining({ invoice: "cancel", lastDay: "2026-11-24" }));
    expect(screen.getByText("Dibatalkan, tidak dibayar")).toBeInTheDocument();
    expect(screen.getByText("Langsung ditutup")).toBeInTheDocument();
  });

  // AC 3: Pertahankan or Hapus, neither preselected.
  it("asks to keep or delete a period that has not started, choosing neither", async () => {
    previewEarlyEnd.mockResolvedValue({
      ok: true,
      plan: {
        ...PLAN,
        upcomingPeriods: "delete",
        deletedPeriods: [{ contractId: WAITING, periodNumber: 2, startDate: "2026-12-16", endDate: "2027-03-15" }],
      },
    });
    renderTrigger([NEXT, period()]);
    open();
    fill();

    const keep = screen.getByRole("radio", { name: /Pertahankan/ });
    const remove = screen.getByRole("radio", { name: /Hapus/ });
    expect(keep).not.toBeChecked();
    expect(remove).not.toBeChecked();
    expect(next()).toBeDisabled();

    fireEvent.click(remove);
    await goOn();

    expect(previewEarlyEnd).toHaveBeenCalledWith(CREATOR, RUNNING, expect.objectContaining({ upcomingPeriods: "delete" }));
    expect(screen.getByText("Periode 2")).toBeInTheDocument();
    expect(screen.getByText(/^Dihapus \(/)).toBeInTheDocument();
  });

  it("lists a kept period as kept", async () => {
    previewEarlyEnd.mockResolvedValue({
      ok: true,
      plan: {
        ...PLAN,
        upcomingPeriods: "keep",
        keptPeriods: [{ contractId: WAITING, periodNumber: 2, startDate: "2026-12-16", endDate: "2027-03-15" }],
        access: "open_for_upcoming",
      },
    });
    renderTrigger([NEXT, period()]);
    open();
    fill();
    fireEvent.click(screen.getByRole("radio", { name: /Pertahankan/ }));
    await goOn();

    expect(screen.getByText(/^Dipertahankan \(/)).toBeInTheDocument();
    expect(screen.getByText("Tetap terbuka untuk periode yang dipertahankan")).toBeInTheDocument();
  });

  // AC 5: final once confirmed; a toast confirms it.
  it("ends the contract, confirms it in a toast and reads the page again", async () => {
    renderTrigger();
    open();
    fill();
    await goOn();
    await confirmEnd();

    expect(endContractEarly).toHaveBeenCalledWith(CREATOR, RUNNING, expect.objectContaining({ lastDay: "2026-11-30" }));
    expect(screen.getByText("Kontrak Rani Kusuma diakhiri per 30 Nov 2026.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows Memproses… while the end is on its way", async () => {
    let settle: (result: EarlyEndResult) => void = () => {};
    endContractEarly.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    renderTrigger();
    open();
    fill();
    await goOn();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Akhiri Kontrak" }));
    });
    expect(screen.getByRole("button", { name: "Memproses…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "‹ Kembali" })).toBeDisabled();

    await act(async () => settle({ ok: true, plan: PLAN }));
  });

  // AC 6: another Admin ended it first.
  it("says the contract was already ended and keeps the confirmation open", async () => {
    endContractEarly.mockResolvedValue({
      ok: false,
      message: "Kontrak sudah diakhiri. Muat ulang untuk melihat status terbaru.",
      errors: {},
    });
    renderTrigger();
    open();
    fill();
    await goOn();
    await confirmEnd();

    expect(screen.getByRole("alert")).toHaveTextContent("Kontrak sudah diakhiri. Muat ulang untuk melihat status terbaru.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("goes back to the form with the server's message under a field it refused", async () => {
    endContractEarly.mockResolvedValue({
      ok: false,
      message: "Data pengakhiran kontrak tidak valid",
      errors: { lastDay: "Pilih antara 25 Nov 2026 dan 14 Des 2026" },
    });
    renderTrigger();
    open();
    fill();
    await goOn();
    await confirmEnd();

    expect(screen.getByText("Pilih antara 25 Nov 2026 dan 14 Des 2026")).toBeInTheDocument();
    expect(screen.getByLabelText(/hari terakhir/i)).toBeInTheDocument();
  });

  it("stays on the form with the message when the preview fails", async () => {
    previewEarlyEnd.mockResolvedValue({ ok: false, message: "Kontrak gagal diakhiri. Coba lagi.", errors: {} });
    renderTrigger();
    open();
    fill();
    await goOn();

    expect(screen.getByRole("alert")).toHaveTextContent("Kontrak gagal diakhiri. Coba lagi.");
    expect(screen.queryByRole("button", { name: "Akhiri Kontrak" })).not.toBeInTheDocument();
  });

  it("goes back from the confirmation with everything still filled in", async () => {
    renderTrigger();
    open();
    fill();
    await goOn();

    fireEvent.click(screen.getByRole("button", { name: "‹ Kembali" }));

    expect(screen.getByLabelText(/catatan/i)).toHaveValue(NOTE);
    expect(screen.getByLabelText(/alasan/i)).toHaveValue("violation");
  });

  it("closes an untouched form at once", () => {
    renderTrigger();
    open();

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks before throwing a filled form away", () => {
    renderTrigger();
    open();
    fill();

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.getByRole("alertdialog", { name: "Batalkan pengakhiran kontrak?" })).toBeInTheDocument();
  });
});
