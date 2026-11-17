import { fireEvent, render, screen } from "@testing-library/react";
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

  it("offers no sync on a row: a content's links are synced from its detail", () => {
    render(<PerformanceBoard rows={[row()]} />);

    expect(screen.queryByRole("button", { name: /Sinkronkan/ })).not.toBeInTheDocument();
  });
});
