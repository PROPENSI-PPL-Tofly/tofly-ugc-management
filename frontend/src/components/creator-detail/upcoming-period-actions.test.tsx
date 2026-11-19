import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { CreatorPeriod } from "@/lib/creator-detail";
import type { DeleteContractResult, SaveContractResult } from "@/lib/contracts";
import { UpcomingPeriodActions } from "./upcoming-period-actions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));

// The API is stubbed: contracts.test covers the requests themselves.
const updateContract = vi.fn<(...args: unknown[]) => Promise<SaveContractResult>>();
const deleteContract = vi.fn<(...args: unknown[]) => Promise<DeleteContractResult>>();
vi.mock("@/lib/contracts", () => ({
  updateContract: (...args: unknown[]) => updateContract(...args),
  deleteContract: (...args: unknown[]) => deleteContract(...args),
}));

const CREATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEXT_ID = "33333333-3333-4333-8333-333333333333";

function period(overrides: Partial<CreatorPeriod> = {}): CreatorPeriod {
  return {
    contractId: "22222222-2222-4222-8222-222222222222",
    periodNumber: 1,
    type: "regular",
    startDate: "2026-07-01",
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

const CURRENT = period();
const NEXT = period({
  contractId: NEXT_ID,
  periodNumber: 2,
  startDate: "2027-01-01",
  endDate: "2027-03-31",
  status: "upcoming",
  fixedRate: 3_000_000,
});

function renderActions(periods: CreatorPeriod[] = [NEXT, CURRENT]) {
  render(<UpcomingPeriodActions creatorId={CREATOR} creatorName="Rani Kusuma" periods={periods} />);
}

describe("UpcomingPeriodActions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T05:00:00Z"));
    refresh.mockReset();
    updateContract.mockReset();
    deleteContract.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers to change or delete a renewal that has not started (AC 8-9)", () => {
    renderActions();

    expect(screen.getByRole("button", { name: "Ubah Periode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hapus Periode" })).toBeInTheDocument();
  });

  it.each([
    ["the newest period has started (AC 10)", [CURRENT]],
    ["the only period is the first contract", [{ ...NEXT, periodNumber: 1 }]],
    ["the creator has no contract", []],
  ])("offers neither while %s", (_label, periods) => {
    renderActions(periods);

    expect(screen.queryByRole("button", { name: /periode/i })).not.toBeInTheDocument();
  });

  describe("Ubah Periode", () => {
    async function saveWithQuota(quota: string) {
      fireEvent.click(screen.getByRole("button", { name: "Ubah Periode" }));
      fireEvent.change(screen.getByLabelText(/jumlah konten/i), { target: { value: quota } });
      fireEvent.click(screen.getByRole("button", { name: "Simpan Perubahan" }));
      await act(async () => {
        fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Simpan" }));
      });
    }

    it("opens the period's own form", () => {
      renderActions();

      fireEvent.click(screen.getByRole("button", { name: "Ubah Periode" }));

      expect(screen.getByRole("dialog", { name: "Ubah Periode 2 — Rani Kusuma" })).toBeInTheDocument();
      expect(screen.getByLabelText(/fixed rate/i)).toHaveValue("3.000.000");
    });

    it("saves the changed terms on that period, confirms with a toast and reloads", async () => {
      updateContract.mockResolvedValue({ ok: true });
      renderActions();

      await saveWithQuota("2");

      expect(updateContract).toHaveBeenCalledWith(CREATOR, NEXT_ID, {
        contractStart: "2027-01-01",
        contractEnd: "2027-03-31",
        interval: 14,
        quota: 2,
        fixedRate: 3_000_000,
        contractType: "regular",
        deadlines: ["2027-01-06", "2027-01-20"],
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(
        "Periode 2 diperbarui. 2 deadline Evergreen di-generate ulang.",
      );
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    // The period started meanwhile (409): the form stays, saying so.
    it("keeps the form open with the server's message when the change is refused", async () => {
      updateContract.mockResolvedValue({
        ok: false,
        message: "Periode bertabrakan dengan periode lain atau sudah dimulai. Muat ulang halaman lalu coba lagi.",
        errors: {},
      });
      renderActions();

      await saveWithQuota("2");

      expect(screen.getByRole("alert")).toHaveTextContent("sudah dimulai");
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe("Hapus Periode", () => {
    it("asks first, naming the period and what goes with it (AC 9)", () => {
      renderActions();

      fireEvent.click(screen.getByRole("button", { name: "Hapus Periode" }));

      const confirm = screen.getByRole("alertdialog", { name: "Hapus Periode 2?" });
      expect(confirm).toHaveTextContent(
        "Slot Evergreen dan invoice kosong periode ini ikut terhapus. Penghapusan tercatat di Log Aktivitas.",
      );
      expect(within(confirm).getByText("1 Jan – 31 Mar 2027")).toBeInTheDocument();
      expect(deleteContract).not.toHaveBeenCalled();
    });

    it("deletes nothing when the admin backs out", () => {
      renderActions();

      fireEvent.click(screen.getByRole("button", { name: "Hapus Periode" }));
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Batal" }));

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(deleteContract).not.toHaveBeenCalled();
    });

    async function confirmDelete() {
      fireEvent.click(screen.getByRole("button", { name: "Hapus Periode" }));
      await act(async () => {
        fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Hapus" }));
      });
    }

    it("deletes that period once confirmed, with a toast and a reload", async () => {
      deleteContract.mockResolvedValue({ ok: true });
      renderActions();

      await confirmDelete();

      expect(deleteContract).toHaveBeenCalledWith(CREATOR, NEXT_ID);
      expect(screen.getByRole("status")).toHaveTextContent("Periode 2 dihapus.");
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("says why when the delete is refused, and reloads nothing", async () => {
      deleteContract.mockResolvedValue({ ok: false, message: "Periode sudah dimulai dan tidak bisa dihapus. Muat ulang halaman." });
      renderActions();

      await confirmDelete();

      expect(screen.getByRole("status")).toHaveTextContent("Periode sudah dimulai dan tidak bisa dihapus.");
      expect(refresh).not.toHaveBeenCalled();
    });

    it("cannot be pressed twice while the delete is on its way", async () => {
      let finish: (result: DeleteContractResult) => void = () => {};
      deleteContract.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      renderActions();

      await confirmDelete();
      expect(screen.getByRole("button", { name: "Hapus Periode" })).toBeDisabled();

      await act(async () => finish({ ok: true }));
      expect(screen.getByRole("button", { name: "Hapus Periode" })).toBeEnabled();
    });
  });
});
