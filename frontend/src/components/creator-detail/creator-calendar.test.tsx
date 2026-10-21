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
};

function entry(overrides: Partial<CreatorContentRow>): CreatorContentRow {
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

const ENTRIES: CreatorContentRow[] = [
  entry({}),
  entry({ contentId: "c-2", name: "Review Kopi", type: "specific", deadline: "2026-10-01", status: "draft_review" }),
  entry({ contentId: "c-3", name: "Evg_2_RanggaPratama_20102026", deadline: "2026-10-20", tags: ["overdue"] }),
  entry({ contentId: "c-4", name: "Evg_3_RanggaPratama_05112026", deadline: "2026-11-05", status: "link_submitted" }),
];

function renderCalendar({
  period = PERIOD,
  entries = ENTRIES,
  today = "2026-10-21",
}: { period?: CreatorPeriod; entries?: CreatorContentRow[]; today?: string } = {}) {
  const onOpen = vi.fn();
  render(<CreatorCalendar period={period} entries={entries} today={today} onOpen={onOpen} />);
  return { onOpen };
}

function dayCell(day: string): HTMLElement {
  return document.querySelector(`[data-day="${day}"]`) as HTMLElement;
}

describe("CreatorCalendar", () => {
  it("is headed Jadwal Konten and opens on today's month while the period runs", () => {
    renderCalendar();

    expect(screen.getByRole("heading", { level: 2, name: "Jadwal Konten" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Oktober 2026" })).toBeInTheDocument();
    expect(dayCell("2026-10-21")).toHaveAttribute("aria-current", "date");
  });

  it("places each content on its deadline day, named and with its status for a screen reader", () => {
    renderCalendar();

    const first = within(dayCell("2026-10-01"));
    expect(first.getByRole("button", { name: "Evg_1_RanggaPratama_01102026 · Scheduled" })).toHaveTextContent(
      "Evergreen #1",
    );
    expect(first.getByRole("button", { name: "Review Kopi · Draft Menunggu Review" })).toHaveTextContent(
      "Review Kopi",
    );
  });

  it("marks an overdue content in words as well as in red", () => {
    renderCalendar();

    const chip = within(dayCell("2026-10-20")).getByRole("button");
    expect(chip).toHaveTextContent("! Evergreen #2");
    expect(chip).toHaveAttribute("data-group", "overdue");
  });

  it("opens the content whose chip was pressed", () => {
    const { onOpen } = renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: "Review Kopi · Draft Menunggu Review" }));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-2");
  });

  it("dims the days outside the period and says so to a screen reader", () => {
    renderCalendar({ today: "2026-09-20" });

    expect(dayCell("2026-09-14")).toHaveAttribute("data-outside", "true");
    expect(dayCell("2026-09-14")).toHaveClass("bg-surface-2");
    expect(within(dayCell("2026-09-14")).getByText("di luar periode")).toHaveClass("sr-only");
    expect(dayCell("2026-09-15")).not.toHaveAttribute("data-outside");
  });

  it("walks only through the period's months", () => {
    renderCalendar({ today: "2026-09-20" });

    expect(screen.getByRole("button", { name: "Bulan Sebelumnya" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Bulan Berikutnya" }));
    fireEvent.click(screen.getByRole("button", { name: "Bulan Berikutnya" }));

    expect(screen.getByRole("heading", { level: 3, name: "November 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bulan Berikutnya" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Bulan Sebelumnya" }));
    expect(screen.getByRole("heading", { level: 3, name: "Oktober 2026" })).toBeInTheDocument();
  });

  it("turns back to today's month with Hari Ini, offered only away from it", () => {
    renderCalendar();

    expect(screen.getByRole("button", { name: "Hari Ini" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Bulan Berikutnya" }));
    fireEvent.click(screen.getByRole("button", { name: "Hari Ini" }));

    expect(screen.getByRole("heading", { level: 3, name: "Oktober 2026" })).toBeInTheDocument();
  });

  it("says why Hari Ini is off when today is outside the period, and opens on its first month", () => {
    renderCalendar({ period: { ...PERIOD, status: "expired" }, today: "2027-01-10" });

    expect(screen.getByRole("heading", { level: 3, name: "September 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hari Ini" })).toBeDisabled();
    expect(screen.getByText("Hari ini di luar periode ini.")).toBeInTheDocument();
  });

  it("explains every colour in words", () => {
    renderCalendar();

    const legend = screen.getByRole("list", { name: "Keterangan warna" });
    expect(within(legend).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Perlu Approval",
      "Menunggu Kreator",
      "Selesai",
      "Overdue",
      "Hari Ini",
    ]);
  });

  it("lists the month's content under the grid for a phone, where a chip is only a dot", () => {
    const { onOpen } = renderCalendar();

    const list = within(screen.getByRole("region", { name: "Konten bulan ini" }));
    expect(list.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "1 Okt 2026Evg_1_RanggaPratama_01102026Menunggu Kreator",
      "1 Okt 2026Review KopiPerlu Approval",
      "20 Okt 2026Evg_2_RanggaPratama_20102026Overdue",
    ]);
    fireEvent.click(list.getByRole("button", { name: /Review Kopi/ }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("c-2");
  });

  it("says a month without content has none, rather than an empty list", () => {
    renderCalendar({ entries: [] });

    expect(screen.getByText("Tidak ada konten di bulan ini.")).toBeInTheDocument();
  });

  it("shows markup in a content's name as the text it is, never as markup", () => {
    const { container } = render(
      <CreatorCalendar
        period={PERIOD}
        entries={[entry({ name: '<img src=x onerror="alert(1)">', type: "specific" })]}
        today="2026-10-21"
        onOpen={vi.fn()}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
  });
});
