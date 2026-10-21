import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CreatorContentRow, CreatorPeriod } from "@/lib/creator-detail";
import { CreatorCalendar } from "./creator-calendar";

const PERIOD: CreatorPeriod = {
  contractId: "22222222-2222-4222-8222-222222222222",
  periodNumber: 2,
  type: "regular",
  startDate: "2026-09-15",
  endDate: "2026-11-14",
  status: "active",
  contentQuota: 4,
  evergreenCount: 3,
  remainingEvergreenQuota: 1,
  daysBetween: 14,
  progress: { submitted: 0, total: 4, percent: 0 },
  performance: { onTimeRate: null, avgRevisions: 0, productivity: "no_data", productivityLabel: "Belum Ada Data" },
};

function entry(overrides: Partial<CreatorContentRow> = {}): CreatorContentRow {
  return {
    contentId: "c-1",
    name: "Evg_1_RanggaPratama_01102026",
    type: "evergreen",
    deadline: "2026-10-01",
    status: "scheduled",
    tags: [],
    revisionCount: 0,
    ...overrides,
  };
}

const ENTRIES = [
  entry(),
  entry({ contentId: "c-2", name: "Review Kopi", type: "specific", status: "draft_review" }),
  entry({ contentId: "c-3", name: "Late Evg", deadline: "2026-10-20", tags: ["overdue"] }),
  entry({ contentId: "c-4", name: "Submitted late", deadline: "2026-11-05", status: "link_submitted", tags: ["overdue"] }),
];

function renderCalendar(today = "2026-10-21", entries = ENTRIES) {
  const onOpen = vi.fn();
  const result = render(<CreatorCalendar period={PERIOD} entries={entries} today={today} onOpen={onOpen} />);
  return { onOpen, ...result };
}

function cell(day: string) {
  return document.querySelector(`[data-day="${day}"]`) as HTMLElement;
}

describe("CreatorCalendar", () => {
  it("uses the shared Sunday-first weekday order and places entries on their deadline dates", () => {
    renderCalendar();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab",
    ]);
    expect(within(cell("2026-10-01")).getByRole("button", { name: "Evg_1_RanggaPratama_01102026 · Scheduled" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bulan Berikutnya" }));
    expect(within(cell("2026-11-05")).getByRole("button", { name: "Submitted late · Content Link Submitted" })).toHaveAttribute("data-group", "done");
  });

  it("navigates only through months touched by this contract and returns to Hari Ini", () => {
    renderCalendar("2026-09-20");
    expect(screen.getByRole("heading", { level: 3, name: "September 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bulan Sebelumnya" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Bulan Berikutnya" }));
    fireEvent.click(screen.getByRole("button", { name: "Bulan Berikutnya" }));
    expect(screen.getByRole("heading", { level: 3, name: "November 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bulan Berikutnya" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Hari Ini" }));
    expect(screen.getByRole("heading", { level: 3, name: "September 2026" })).toBeInTheDocument();
  });

  it("marks outside-period days and explains why Hari Ini is unavailable after the contract", () => {
    renderCalendar("2027-01-10");
    expect(screen.getByRole("heading", { level: 3, name: "September 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hari Ini" })).toBeDisabled();
    expect(screen.getByText("Hari ini di luar periode ini.")).toBeInTheDocument();
    expect(cell("2026-09-14")).toHaveAttribute("data-outside", "true");
    expect(cell("2026-09-15")).not.toHaveAttribute("data-outside");
  });

  it("explains content groups in words and opens the selected content", () => {
    const { onOpen } = renderCalendar();
    const legend = screen.getByRole("list", { name: "Keterangan warna" });
    expect(within(legend).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Perlu Approval", "Menunggu Kreator", "Selesai", "Overdue", "Hari Ini",
    ]);
    fireEvent.click(within(cell("2026-10-01")).getByRole("button", { name: "Review Kopi · Draft Menunggu Review" }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-2");
  });

  it("says when the selected month has no deadlines", () => {
    renderCalendar("2026-10-21", []);
    expect(screen.getByText("Tidak ada konten di bulan ini.")).toBeInTheDocument();
  });

  it("renders creator supplied content names as text", () => {
    const { container } = renderCalendar("2026-10-21", [entry({ name: '<img src=x onerror="alert(1)">' })]);
    expect(screen.getAllByText('<img src=x onerror="alert(1)">').length).toBeGreaterThan(0);
    expect(container.querySelector("img,script")).toBeNull();
  });
});
