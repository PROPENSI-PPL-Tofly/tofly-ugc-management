import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  DEFAULT_CONTENT_PLAN_PARAMS,
  type ContentPlanParams,
  type ContentPlanRow,
} from "@/lib/content-plan";
import { ContentPlanCalendar } from "./content-plan-calendar";

const TODAY = "2026-11-12";
const NOVEMBER = { year: 2026, month: 11 };
const CALENDAR: ContentPlanParams = {
  ...DEFAULT_CONTENT_PLAN_PARAMS,
  view: "calendar",
};

function row(overrides: Partial<ContentPlanRow>): ContentPlanRow {
  return {
    contentId: "c",
    name: "Konten",
    creatorId: "11111111-1111-4111-8111-111111111111",
    creatorName: "Salsa Wijaya",
    type: "evergreen",
    deadline: "2026-11-05",
    status: "scheduled",
    tags: [],
    revisionCount: 0,
    platforms: [],
    ...overrides,
  };
}

// Two creators, both types, an overdue item, a late hand-in, a pending proposal, a malformed day.
const ITEMS: ContentPlanRow[] = [
  row({
    contentId: "evg",
    name: "Evg_3_Salsa_05Nov2026",
    deadline: "2026-11-05",
  }),
  row({
    contentId: "spec",
    name: "Review Serum",
    type: "specific",
    creatorName: "Rangga Pratama",
    creatorId: "22222222-2222-4222-8222-222222222222",
    deadline: "2026-11-05",
    status: "draft_review",
  }),
  row({
    contentId: "late",
    name: "Unboxing",
    deadline: "2026-11-02",
    tags: ["overdue"],
  }),
  row({
    contentId: "late-done",
    name: "Tutorial",
    deadline: "2026-11-03",
    status: "link_submitted",
    tags: ["overdue"],
  }),
  row({
    contentId: "proposal",
    name: "Ide Baru",
    type: "specific",
    deadline: "2026-11-20",
    status: "pending",
  }),
  row({ contentId: "broken", name: "Rusak", deadline: "not-a-day" }),
];

function renderCalendar(
  props: Partial<Parameters<typeof ContentPlanCalendar>[0]> = {},
) {
  const onOpen = vi.fn();
  render(
    <ContentPlanCalendar
      items={ITEMS}
      month={NOVEMBER}
      today={TODAY}
      state={CALENDAR}
      filtered={false}
      onOpen={onOpen}
      {...props}
    />,
  );
  return { onOpen };
}

function day(value: string): HTMLElement {
  return document.querySelector(`td[data-day="${value}"]`) as HTMLElement;
}

function chip(name: RegExp): HTMLElement {
  return within(screen.getByRole("table")).getByRole("button", { name });
}

describe("ContentPlanCalendar", () => {
  it("heads the grid with the shown month and puts each content on its deadline day", () => {
    renderCalendar();

    expect(
      screen.getByRole("heading", { name: "November 2026" }),
    ).toBeInTheDocument();
    expect(within(day("2026-11-05")).getAllByRole("button")).toHaveLength(2);
    expect(within(day("2026-11-20")).getByRole("button")).toBeInTheDocument();
  });

  it("labels each chip with the creator's first name and the content, naming both in full for screen readers", () => {
    renderCalendar();

    const spec = chip(/^Review Serum/);
    expect(spec).toHaveTextContent("Rangga · Review Serum");
    expect(spec).toHaveAccessibleName(
      "Review Serum · Rangga Pratama · Draft Menunggu Review",
    );
    expect(spec).toHaveAttribute(
      "title",
      "Review Serum · Rangga Pratama · Draft Menunggu Review",
    );
    expect(chip(/^Evg_3/)).toHaveTextContent("Salsa · Evg_3_Salsa_05Nov2026");
  });

  it("colours a chip by its content type, not its status", () => {
    renderCalendar();

    expect(chip(/^Review Serum/)).toHaveAttribute("data-type", "specific");
    expect(chip(/^Review Serum/).className).toContain("bg-accent-wash");
    expect(chip(/^Evg_3/)).toHaveAttribute("data-type", "evergreen");
    expect(chip(/^Evg_3/).className).toContain("bg-surface-2");
  });

  it("marks overdue unfinished content with a separate red dot, keeping its type colour", () => {
    renderCalendar();

    const late = chip(/^Unboxing/);
    expect(late).toHaveAttribute("data-overdue", "true");
    expect(late).toHaveAttribute("data-type", "evergreen");
    expect(late.querySelector("[data-overdue-dot]")).not.toBeNull();
    expect(late).toHaveAccessibleName(/Overdue$/);
  });

  it("does not mark a late but finished hand-in as overdue", () => {
    renderCalendar();

    const done = chip(/^Tutorial/);
    expect(done).not.toHaveAttribute("data-overdue");
    expect(done.querySelector("[data-overdue-dot]")).toBeNull();
  });

  it("outlines a pending proposal in dashes", () => {
    renderCalendar();

    const proposal = chip(/^Ide Baru/);
    expect(proposal).toHaveAttribute("data-pending", "true");
    expect(proposal.className).toContain("outline-dashed");
    expect(proposal).toHaveAccessibleName(/Menunggu persetujuan$/);
    expect(chip(/^Review Serum/)).not.toHaveAttribute("data-pending");
  });

  it("skips a content whose deadline is not a day rather than breaking the month (OWASP A10)", () => {
    renderCalendar();

    expect(screen.queryByRole("button", { name: /^Rusak/ })).toBeNull();
  });

  it("opens the pressed content by its id", () => {
    const { onOpen } = renderCalendar();

    fireEvent.click(chip(/^Review Serum/));

    expect(onOpen).toHaveBeenCalledWith("spec");
  });

  it("marks today and keys the legend: Evergreen, Specific, Overdue, Menunggu persetujuan, Hari Ini", () => {
    renderCalendar();

    expect(day(TODAY)).toHaveAttribute("aria-current", "date");
    const legend = screen.getByRole("list", { name: "Keterangan warna" });
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Evergreen",
      "Specific",
      "Overdue",
      "Menunggu persetujuan",
      "Hari Ini",
    ]);
  });

  it("turns months through links that keep the filters, across the year end", () => {
    renderCalendar({
      month: { year: 2026, month: 12 },
      state: { ...CALENDAR, type: ["specific"], month: "2026-12" },
    });

    expect(
      screen.getByRole("link", { name: "Bulan Berikutnya" }),
    ).toHaveAttribute(
      "href",
      "/admin/content-plan?type=specific&view=calendar&month=2027-01",
    );
    expect(
      screen.getByRole("link", { name: "Bulan Sebelumnya" }),
    ).toHaveAttribute(
      "href",
      "/admin/content-plan?type=specific&view=calendar&month=2026-11",
    );
    expect(screen.getByRole("link", { name: "Hari Ini" })).toHaveAttribute(
      "href",
      "/admin/content-plan?type=specific&view=calendar",
    );
  });

  it("offers no Hari Ini link while today's month is already shown", () => {
    renderCalendar();

    expect(screen.queryByRole("link", { name: "Hari Ini" })).toBeNull();
    expect(screen.getByRole("button", { name: "Hari Ini" })).toBeDisabled();
  });

  it("lists the month's content with creator names for small screens", () => {
    renderCalendar();

    const list = screen.getByRole("region", { name: "Konten bulan ini" });
    const entries = within(list).getAllByRole("button");
    // In date order; the malformed day is not in the month.
    expect(entries.map((entry) => entry.getAttribute("data-content"))).toEqual([
      "late",
      "late-done",
      "evg",
      "spec",
      "proposal",
    ]);
    expect(within(list).getByText("Rangga Pratama")).toBeInTheDocument();
  });

  it("says when the month holds nothing, worded for a filter when one is set", () => {
    renderCalendar({ items: [] });
    expect(
      screen.getAllByText("Tidak ada konten di bulan ini.").length,
    ).toBeGreaterThan(0);
  });

  it("says when a filter emptied the month", () => {
    renderCalendar({ items: [], filtered: true });
    expect(
      screen.getAllByText("Tidak ada konten sesuai filter.").length,
    ).toBeGreaterThan(0);
  });

  it("renders names as text, never as markup (OWASP A05)", () => {
    renderCalendar({
      items: [
        row({
          contentId: "x",
          name: '<img src=x onerror="alert(1)">',
          creatorName: "<b>Eve</b>",
        }),
      ],
    });

    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("b")).toBeNull();
    expect(chip(/^<img/)).toHaveTextContent(
      '<b>Eve</b> · <img src=x onerror="alert(1)">',
    );
  });
});
