import { fireEvent, render, screen } from "@testing-library/react";
import {
  syncContentPerformance,
  type SyncResult,
} from "@/lib/link-performance-api";
import type { PerformanceLinkRow } from "@/lib/performance-links";
import { PerformanceBoard } from "./performance-board";

vi.mock("@/components/content-detail/content-detail-panel", () => ({
  ContentDetailPanel: ({
    contentId,
    onClose,
  }: {
    contentId: string;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label={`Detail ${contentId}`}>
      <button type="button" onClick={onClose}>
        tutup
      </button>
    </div>
  ),
}));

vi.mock("@/lib/link-performance-api", () => ({ syncContentPerformance: vi.fn() }));

const mockedSync = vi.mocked(syncContentPerformance);
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, replace: vi.fn() }),
}));

function row(overrides: Partial<PerformanceLinkRow> = {}): PerformanceLinkRow {
  return {
    linkId: "33333333-3333-4333-8333-333333333333",
    contentId: "44444444-4444-4444-8444-444444444444",
    contentName: "Evg_1_RanggaPratama_12102026",
    creatorId: "11111111-1111-4111-8111-111111111111",
    creatorName: "Rangga Pratama",
    platform: "instagram",
    url: "https://instagram.com/p/x",
    views: 12400,
    likes: 900,
    comments: null,
    shares: null,
    state: "synced",
    lastSyncedAt: "2026-11-01T03:00:00.000Z",
    manualAt: null,
    ...overrides,
  };
}

describe("PerformanceBoard", () => {
  beforeEach(() => {
    mockedSync.mockReset();
    mockRefresh.mockReset();
  });

  it("opens the pressed row's content detail (AC 25)", () => {
    render(<PerformanceBoard rows={[row()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Evg_1_RanggaPratama_12102026" }));

    expect(screen.getByRole("dialog", { name: "Detail 44444444-4444-4444-8444-444444444444" })).toBeInTheDocument();
  });

  it("closes the panel and leaves the list standing", () => {
    render(<PerformanceBoard rows={[row()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Evg_1_RanggaPratama_12102026" }));
    fireEvent.click(screen.getByRole("button", { name: "tutup" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("12.400")).toBeInTheDocument();
  });

  it("syncs a pressed row's content and reports how it went (AC 12, 13)", async () => {
    mockedSync.mockResolvedValue({ ok: true, toast: "Data performa diperbarui" });
    render(<PerformanceBoard rows={[row()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Sinkronkan" }));

    expect(mockedSync).toHaveBeenCalledWith("44444444-4444-4444-8444-444444444444");
    expect(await screen.findByText("Data performa diperbarui")).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("says so when only part of a content's links synced (AC 13)", async () => {
    mockedSync.mockResolvedValue({ ok: true, toast: "Sebagian link gagal disinkronkan" });
    render(<PerformanceBoard rows={[row()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Sinkronkan" }));

    expect(await screen.findByText("Sebagian link gagal disinkronkan")).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("holds every row of that content while it syncs (AC 13, 24)", async () => {
    let settle!: (result: SyncResult) => void;
    mockedSync.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    render(
      <PerformanceBoard
        rows={[
          row(),
          row({
            linkId: "55555555-5555-4555-8555-555555555555",
            platform: "tiktok",
            url: "https://tiktok.com/@rangga/video/1",
          }),
        ]}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Sinkronkan" })[0]);

    const held = screen.getAllByRole("button", { name: "Menyinkronkan…" });
    expect(held).toHaveLength(2);
    for (const button of held) expect(button).toBeDisabled();

    settle({ ok: true, toast: "Data performa diperbarui" });
    expect(await screen.findByText("Data performa diperbarui")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Sinkronkan" })).toHaveLength(2);
  });

  it("reports a failed sync and leaves the rows untouched", async () => {
    mockedSync.mockResolvedValue({ ok: false, message: "Sinkronisasi gagal. Coba lagi." });
    render(<PerformanceBoard rows={[row()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Sinkronkan" }));

    expect(await screen.findByText("Sinkronisasi gagal. Coba lagi.")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
