import { render, screen, within } from "@testing-library/react";
import type { CreatorPeriod } from "@/lib/creator-detail";
import { PeriodTabs } from "./period-tabs";

const CREATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FIRST = "11111111-1111-4111-8111-111111111111";
const SECOND = "22222222-2222-4222-8222-222222222222";
const THIRD = "33333333-3333-4333-8333-333333333333";

function period(overrides: Partial<CreatorPeriod> = {}): CreatorPeriod {
  return {
    contractId: SECOND,
    periodNumber: 2,
    type: "regular",
    startDate: "2026-06-01",
    endDate: "2026-12-31",
    status: "active",
    contentQuota: 19,
    evergreenCount: 18,
    remainingEvergreenQuota: 1,
    daysBetween: 14,
    ...overrides,
  };
}

const NEWEST = period();
const OLDEST = period({
  contractId: FIRST,
  periodNumber: 1,
  type: "probation",
  startDate: "2026-01-01",
  endDate: "2026-05-31",
  status: "expired",
  contentQuota: 3,
  evergreenCount: 3,
  remainingEvergreenQuota: 0,
  daysBetween: 7,
});

// Newest first, the order the page's view carries them in.
const PERIODS = [NEWEST, OLDEST];

function tabs() {
  return within(screen.getByRole("navigation", { name: "Pilih periode kontrak" })).getAllByRole(
    "link",
  );
}

/** The value written under a term's label. */
function term(label: string) {
  return screen.getByText(label).nextElementSibling;
}

describe("PeriodTabs", () => {
  it("is headed Periode Kontrak", () => {
    render(<PeriodTabs creatorId={CREATOR} periods={PERIODS} selected={NEWEST} />);

    expect(screen.getByRole("heading", { level: 2, name: "Periode Kontrak" })).toBeInTheDocument();
  });

  it("lays the periods out oldest to newest, as the prototype does", () => {
    render(<PeriodTabs creatorId={CREATOR} periods={PERIODS} selected={NEWEST} />);

    const [first, second] = tabs();
    expect(tabs()).toHaveLength(2);
    expect(first).toHaveTextContent("Periode 1 · Probation");
    expect(second).toHaveTextContent("Periode 2 · Regular");
  });

  it("words each period's state and dates on its tab", () => {
    render(<PeriodTabs creatorId={CREATOR} periods={PERIODS} selected={NEWEST} />);

    const [first, second] = tabs();
    expect(first).toHaveTextContent("Berakhir");
    expect(first).toHaveTextContent("1 Jan – 31 Mei 2026");
    expect(second).toHaveTextContent("Aktif");
    expect(second).toHaveTextContent("1 Jun – 31 Des 2026");
  });

  it.each([
    [0, "Berakhir", "bg-red"],
    [1, "Aktif", "bg-green"],
  ])("draws tab %i's state as a dot and its words, as Creator Database draws a contract", (index, label, colour) => {
    render(<PeriodTabs creatorId={CREATOR} periods={PERIODS} selected={NEWEST} />);

    const state = within(tabs()[index]).getByText(label);
    expect(state).not.toHaveClass("rounded-full");
    expect(state.querySelector('[aria-hidden="true"]')).toHaveClass(colour);
  });

  it("words a period that has not started yet", () => {
    const upcoming = period({ contractId: THIRD, periodNumber: 3, status: "upcoming" });
    render(<PeriodTabs creatorId={CREATOR} periods={[upcoming, ...PERIODS]} selected={upcoming} />);

    expect(tabs()).toHaveLength(3);
    expect(tabs()[2]).toHaveTextContent("Periode 3 · Regular");
    expect(tabs()[2]).toHaveTextContent("Belum Dimulai");
  });

  it("marks the open period as the current one, and only it", () => {
    render(<PeriodTabs creatorId={CREATOR} periods={PERIODS} selected={OLDEST} />);

    const [first, second] = tabs();
    expect(first).toHaveAttribute("aria-current", "true");
    expect(second).not.toHaveAttribute("aria-current");
  });

  it("links the newest period to the bare address and an older one by its contract", () => {
    render(<PeriodTabs creatorId={CREATOR} periods={PERIODS} selected={NEWEST} />);

    const [first, second] = tabs();
    expect(first).toHaveAttribute("href", `/admin/creators/${CREATOR}?contract=${FIRST}`);
    expect(second).toHaveAttribute("href", `/admin/creators/${CREATOR}`);
  });

  it("shows the open period's terms", () => {
    render(<PeriodTabs creatorId={CREATOR} periods={PERIODS} selected={NEWEST} />);

    expect(term("Kuota Konten")).toHaveTextContent("19 konten");
    expect(term("Sisa Kuota Evergreen")).toHaveTextContent("1 konten");
    expect(term("Jarak Antar-Deadline")).toHaveTextContent("14 hari");
  });

  it("shows the terms of whichever period is open", () => {
    render(<PeriodTabs creatorId={CREATOR} periods={PERIODS} selected={OLDEST} />);

    expect(term("Kuota Konten")).toHaveTextContent("3 konten");
    expect(term("Sisa Kuota Evergreen")).toHaveTextContent("0 konten");
    expect(term("Jarak Antar-Deadline")).toHaveTextContent("7 hari");
  });

  // The creator detail endpoint (4.1) sends no fixed rate, so the terms do not offer one.
  it("shows three terms and no fixed rate", () => {
    render(<PeriodTabs creatorId={CREATOR} periods={PERIODS} selected={NEWEST} />);

    expect(screen.getAllByRole("term").map((label) => label.textContent)).toEqual([
      "Kuota Konten",
      "Sisa Kuota Evergreen",
      "Jarak Antar-Deadline",
    ]);
    expect(screen.queryByText(/Rp/)).toBeNull();
  });

  it("shows a creator's only period as one tab, open", () => {
    render(<PeriodTabs creatorId={CREATOR} periods={[NEWEST]} selected={NEWEST} />);

    expect(tabs()).toHaveLength(1);
    expect(tabs()[0]).toHaveAttribute("aria-current", "true");
    expect(tabs()[0]).toHaveAttribute("href", `/admin/creators/${CREATOR}`);
  });

  it("says a creator has no contract rather than showing an empty panel", () => {
    render(<PeriodTabs creatorId={CREATOR} periods={[]} selected={null} />);

    expect(screen.getByRole("heading", { name: "Periode Kontrak" })).toBeInTheDocument();
    expect(screen.getByText("Belum ada kontrak")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("term")).toBeNull();
  });
});
