import { render, screen } from "@testing-library/react";
import { EMPTY } from "@/lib/format";
import { DATA_STATE_LABELS, type DataState } from "@/lib/link-performance";
import type { PerformanceLinkRow } from "@/lib/performance-links";
import { LinkPerformanceTable } from "./link-performance-table";

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

describe("LinkPerformanceTable", () => {
  it("lists each row with its creator, content, platform and last sync (AC 22)", () => {
    render(<LinkPerformanceTable rows={[row()]} showCreator />);

    expect(screen.getByText("Rangga Pratama")).toBeInTheDocument();
    expect(screen.getByText("Evg_1_RanggaPratama_12102026")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Instagram" })).toBeInTheDocument();
    expect(screen.getByText("Tersinkron")).toBeInTheDocument();
    // The tip repeats the moment; the column cell is the one that lists it.
    expect(screen.getByText(/1 Nov 2026/, { selector: "td" })).toBeInTheDocument();
  });

  it("writes the four numbers in Indonesian format, and an empty one as a dash, never 0 (AC 2, 19)", () => {
    render(<LinkPerformanceTable rows={[row()]} />);

    expect(screen.getByText("12.400")).toBeInTheDocument();
    expect(screen.getByText("900")).toBeInTheDocument();
    expect(screen.getAllByText(EMPTY)).toHaveLength(2);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it.each(Object.entries(DATA_STATE_LABELS))(
    "words the %s state as %s and explains it on a tip (AC 3)",
    (state, label) => {
      render(<LinkPerformanceTable rows={[row({ state: state as DataState })]} />);

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Tentang ${label}` })).toBeInTheDocument();
    },
  );

  it("keeps the creator column to the admin's list; a creator reads their own (AC 20)", () => {
    const { unmount } = render(<LinkPerformanceTable rows={[row()]} />);

    expect(screen.queryByText("Kreator")).not.toBeInTheDocument();
    expect(screen.getByText("Konten")).toBeInTheDocument();
    unmount();

    render(<LinkPerformanceTable rows={[row()]} showCreator />);
    expect(screen.getByText("Kreator")).toBeInTheDocument();
  });

  it("shows a link kept from before platforms were recorded as plain Link, without a mark", () => {
    render(<LinkPerformanceTable rows={[row({ platform: null, url: "https://example.com/video/old" })]} />);

    expect(screen.getByText("Link")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
