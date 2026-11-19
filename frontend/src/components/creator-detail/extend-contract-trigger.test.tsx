import { act, fireEvent, render, screen } from "@testing-library/react";
import type { CreatorPeriod } from "@/lib/creator-detail";
import type { SaveContractResult } from "@/lib/contracts";
import { ExtendContractTrigger } from "./extend-contract-trigger";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));

// The API is stubbed: contracts.test covers the request itself.
const createContract = vi.fn<(...args: unknown[]) => Promise<SaveContractResult>>();
vi.mock("@/lib/contracts", () => ({
  createContract: (...args: unknown[]) => createContract(...args),
}));

const CREATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function period(overrides: Partial<CreatorPeriod> = {}): CreatorPeriod {
  return {
    contractId: "22222222-2222-4222-8222-222222222222",
    periodNumber: 2,
    type: "regular",
    startDate: "2026-06-01",
    endDate: "2026-12-31",
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

function renderTrigger(periods: CreatorPeriod[] = [period()]) {
  render(<ExtendContractTrigger creatorId={CREATOR} creatorName="Rani Kusuma" periods={periods} />);
}

function openAndFill() {
  fireEvent.click(screen.getByRole("button", { name: "+ Perpanjang Kontrak" }));
  fireEvent.change(screen.getByLabelText(/akhir kontrak/i), { target: { value: "2027-03-31" } });
  fireEvent.change(screen.getByLabelText(/jumlah konten/i), { target: { value: "2" } });
}

async function confirm() {
  fireEvent.click(screen.getByRole("button", { name: "Perpanjang Kontrak" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Perpanjang" }));
  });
}

describe("ExtendContractTrigger", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T05:00:00Z"));
    refresh.mockReset();
    createContract.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AC 1: while the current contract runs and any time after it ended, an early end included.
  it.each([
    ["the contract runs", [period()]],
    ["it ended", [period({ status: "expired", endDate: "2026-10-31" })]],
    ["it was ended early for fraud", [period({ status: "expired", earlyEndReason: "fraud" })]],
  ])("offers Perpanjang Kontrak while %s", (_label, periods) => {
    renderTrigger(periods);

    expect(screen.getByRole("button", { name: "+ Perpanjang Kontrak" })).toBeInTheDocument();
  });

  it.each([
    ["a next period is waiting to start", [period({ status: "upcoming" }), period()]],
    ["the creator has no contract", []],
  ])("offers nothing while %s", (_label, periods) => {
    renderTrigger(periods);

    expect(screen.queryByRole("button", { name: /perpanjang kontrak/i })).not.toBeInTheDocument();
  });

  it("opens the form for this creator on the button", () => {
    renderTrigger();

    fireEvent.click(screen.getByRole("button", { name: "+ Perpanjang Kontrak" }));

    expect(screen.getByRole("dialog", { name: "Perpanjang Kontrak — Rani Kusuma" })).toBeInTheDocument();
  });

  it("saves the new period for this creator, closes, confirms with a toast and reloads (AC 3-4)", async () => {
    createContract.mockResolvedValue({ ok: true });
    renderTrigger();
    openAndFill();

    await confirm();

    expect(createContract).toHaveBeenCalledWith(CREATOR, {
      contractStart: "2027-01-01",
      contractEnd: "2027-03-31",
      interval: 14,
      quota: 2,
      fixedRate: 2_500_000,
      contractType: "regular",
      deadlines: ["2027-01-06", "2027-01-20"],
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Kontrak Rani Kusuma diperpanjang sampai 31 Mar 2027. 2 deadline Evergreen baru ter-generate.",
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("disables the button while the period is being saved", async () => {
    let finish: (result: SaveContractResult) => void = () => {};
    createContract.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderTrigger();
    openAndFill();

    await confirm();
    expect(screen.getByRole("button", { name: "Perpanjang Kontrak" })).toBeDisabled();

    await act(async () => finish({ ok: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the form open with the server's message under the refused field", async () => {
    createContract.mockResolvedValue({
      ok: false,
      message: "Data periode tidak valid",
      errors: { contractStart: "Tanggal mulai harus setelah akhir kontrak sebelumnya" },
    });
    renderTrigger();
    openAndFill();

    await confirm();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Tanggal mulai harus setelah akhir kontrak sebelumnya")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  // Another admin extended the contract meanwhile (409): the page is stale.
  it("shows a failure that belongs to no field as an alert, and keeps what was filled in", async () => {
    createContract.mockResolvedValue({
      ok: false,
      message: "Periode bertabrakan dengan periode lain atau sudah dimulai. Muat ulang halaman lalu coba lagi.",
      errors: {},
    });
    renderTrigger();
    openAndFill();

    await confirm();

    expect(screen.getByRole("alert")).toHaveTextContent("Periode bertabrakan dengan periode lain");
    expect(screen.getByLabelText(/akhir kontrak/i)).toHaveValue("2027-03-31");
  });

  it("forgets the last failure when the form is closed and opened again", async () => {
    createContract.mockResolvedValue({ ok: false, message: "Periode gagal disimpan. Coba lagi.", errors: {} });
    renderTrigger();
    openAndFill();
    await confirm();

    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    fireEvent.click(screen.getByRole("button", { name: "Buang" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Perpanjang Kontrak" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
