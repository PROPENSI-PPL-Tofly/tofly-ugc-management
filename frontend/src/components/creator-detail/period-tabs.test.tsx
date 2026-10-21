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
    progress: { submitted: 2, total: 6, percent: 33 },
    performance: { onTimeRate: 50, avgRevisions: 1, productivity: "watch", productivityLabel: "Perlu Perhatian" },
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
  progress: { submitted: 2, total: 6, percent: 33 },
  performance: { onTimeRate: 50, avgRevisions: 1, productivity: "watch", productivityLabel: "Perlu Perhatian" },
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
    render(<PeriodTabs creatorId={CREATOR} creatorName="Rangga Pratama" earnings={null} periods={PERIODS} selected={NEWEST} />);

    expect(screen.getByRole("heading", { level: 2, name: "Periode Kontrak" })).toBeInTheDocument();
  });

  it("lays the periods out oldest to newest, as the prototype does", () => {
    render(<PeriodTabs creatorId={CREATOR} creatorName="Rangga Pratama" earnings={null} periods={PERIODS} selected={NEWEST} />);

    const [first, second] = tabs();
    expect(tabs()).toHaveLength(2);
    expect(first).toHaveTextContent("Periode 1 · Probation");
    expect(second).toHaveTextContent("Periode 2 · Regular");
  });

  it("words each period's state and dates on its tab", () => {
    render(<PeriodTabs creatorId={CREATOR} creatorName="Rangga Pratama" earnings={null} periods={PERIODS} selected={NEWEST} />);

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
    render(<PeriodTabs creatorId={CREATOR} creatorName="Rangga Pratama" earnings={null} periods={PERIODS} selected={NEWEST} />);

    const state = within(tabs()[index]).getByText(label);
    expect(state).not.toHaveClass("rounded-full");
    expect(state.querySelector('[aria-hidden="true"]')).toHaveClass(colour);
  });

  it("words a period that has not started yet", () => {
    const upcoming = period({ contractId: THIRD, periodNumber: 3, status: "upcoming" });
    render(<PeriodTabs creatorId={CREATOR} creatorName="Rangga Pratama" earnings={null} periods={[upcoming, ...PERIODS]} selected={upcoming} />);

    expect(tabs()).toHaveLength(3);
    expect(tabs()[2]).toHaveTextContent("Periode 3 · Regular");
    expect(tabs()[2]).toHaveTextContent("Belum Dimulai");
  });

  it("marks the open period as the current one, and only it", () => {
    render(<PeriodTabs creatorId={CREATOR} creatorName="Rangga Pratama" earnings={null} periods={PERIODS} selected={OLDEST} />);

    const [first, second] = tabs();
    expect(first).toHaveAttribute("aria-current", "true");
    expect(second).not.toHaveAttribute("aria-current");
  });

  it("links the newest period to the bare address and an older one by its contract", () => {
    render(<PeriodTabs creatorId={CREATOR} creatorName="Rangga Pratama" earnings={null} periods={PERIODS} selected={NEWEST} />);

    const [first, second] = tabs();
    expect(first).toHaveAttribute("href", `/admin/creators/${CREATOR}?contract=${FIRST}`);
    expect(second).toHaveAttribute("href", `/admin/creators/${CREATOR}`);
  });

  it("shows the open period's terms", () => {
    render(<PeriodTabs creatorId={CREATOR} creatorName="Rangga Pratama" earnings={null} periods={PERIODS} selected={NEWEST} />);

    expect(term("Kuota Konten")).toHaveTextContent("19 konten");
    expect(term("Sisa Kuota Evergreen")).toHaveTextContent("1 konten");
    expect(term("Jarak Antar-Deadline")).toHaveTextContent("14 hari");
  });

  it("shows the terms of whichever period is open", () => {
    render(<PeriodTabs creatorId={CREATOR} creatorName="Rangga Pratama" earnings={null} periods={PERIODS} selected={OLDEST} />);

    expect(term("Kuota Konten")).toHaveTextContent("3 konten");
    expect(term("Sisa Kuota Evergreen")).toHaveTextContent("0 konten");
    expect(term("Jarak Antar-Deadline")).toHaveTextContent("7 hari");
  });

  // The creator detail endpoint (4.1) sends no fixed rate, so the terms do not offer one.
  it("shows three terms and no fixed rate", () => {
    render(<PeriodTabs creatorId={CREATOR} creatorName="Rangga Pratama" earnings={null} periods={PERIODS} selected={NEWEST} />);

    // The three terms come first; the performance cards follow in their own section.
    expect(screen.getAllByRole("term").slice(0, 3).map((label) => label.textContent)).toEqual([
      "Kuota Konten",
      "Sisa Kuota Evergreen",
      "Jarak Antar-Deadline",
    ]);
    expect(screen.queryByText(/Rp/)).toBeNull();
  });

  it("shows a creator's only period as one tab, open", () => {
    render(<PeriodTabs creatorId={CREATOR} creatorName="Rangga Pratama" earnings={null} periods={[NEWEST]} selected={NEWEST} />);

    expect(tabs()).toHaveLength(1);
    expect(tabs()[0]).toHaveAttribute("aria-current", "true");
    expect(tabs()[0]).toHaveAttribute("href", `/admin/creators/${CREATOR}`);
  });

  it("says a creator has no contract rather than showing an empty panel", () => {
    render(<PeriodTabs creatorId={CREATOR} creatorName="Rangga Pratama" earnings={null} periods={[]} selected={null} />);

    expect(screen.getByRole("heading", { name: "Periode Kontrak" })).toBeInTheDocument();
    expect(screen.getByText("Belum ada kontrak")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("term")).toBeNull();
  });
});

describe("PeriodTabs performance cards", () => {
  function cards(props: Partial<Parameters<typeof PeriodTabs>[0]> = {}) {
    render(
      <PeriodTabs
        creatorId={CREATOR}
        creatorName="Rangga Pratama"
        periods={[NEWEST]}
        selected={NEWEST}
        earnings={{ amount: 2500000, status: "accruing" }}
        {...props}
      />,
    );
    return within(screen.getByRole("region", { name: "Performa periode" }));
  }

  /** The value a card shows, by its label. */
  function card(region: ReturnType<typeof cards>, label: string): HTMLElement {
    return region.getByText(label).closest("div") as HTMLElement;
  }

  it("shows the prototype's five cards for the open period, in its order", () => {
    const region = cards();

    // Each card's own words, before the ⓘ that explains Produktivitas.
    expect(region.getAllByRole("term").map((term) => term.childNodes[0].textContent)).toEqual([
      "Progres Konten",
      "Tepat Waktu",
      "Rata-rata Revisi",
      "Produktivitas",
      "Total Pendapatan",
    ]);
  });

  it("counts the content handed in, with a bar that says its percentage", () => {
    const region = cards();

    expect(card(region, "Progres Konten")).toHaveTextContent("2/6");
    expect(region.getByRole("progressbar", { name: "Progres 33%" })).toHaveAttribute("value", "33");
  });

  it("reads the on-time rate and the revisions as Creator Database does", () => {
    const region = cards();

    expect(card(region, "Tepat Waktu")).toHaveTextContent("50%");
    expect(card(region, "Rata-rata Revisi")).toHaveTextContent("1x");
  });

  it("says no on-time rate yet with a dash, not a zero", () => {
    const region = cards({
      selected: { ...NEWEST, performance: { ...NEWEST.performance, onTimeRate: null } },
    });

    expect(card(region, "Tepat Waktu")).toHaveTextContent("—");
  });

  it("judges productivity as a pill, with the rules behind an info button", () => {
    const region = cards();

    const productivity = region.getByText("Perlu Perhatian");
    expect(productivity).toHaveClass("rounded-full");
    expect(region.getByRole("button", { name: "Tentang Produktivitas" })).toBeInTheDocument();
    expect(region.getByRole("tooltip", { hidden: true })).toHaveTextContent(
      "Baik: tepat waktu 80% ke atas dan revisi maksimal 1x.",
    );
  });

  it("does not judge a period that has not started", () => {
    const region = cards({ selected: { ...NEWEST, status: "upcoming" }, earnings: null });

    expect(region.getByText("Belum Dinilai")).toBeInTheDocument();
    expect(card(region, "Total Pendapatan")).toHaveTextContent("—");
  });

  it("shows what the period earns, where its invoice stands, and the way to it", () => {
    const region = cards({ earnings: { amount: 2500000, status: "finalized" } });

    const earnings = card(region, "Total Pendapatan");
    expect(earnings).toHaveTextContent("Rp2.500.000");
    expect(within(earnings).getByText("Invoice Terkirim")).toHaveClass("rounded-full");
    expect(region.getByRole("link", { name: "Lihat Invoice ›" })).toHaveAttribute(
      "href",
      "/admin/invoicing?q=Rangga+Pratama",
    );
  });

  it("says nothing it does not know when the invoice could not be read", () => {
    const region = cards({ earnings: null });

    expect(card(region, "Total Pendapatan")).toHaveTextContent("—");
    expect(region.queryByRole("link", { name: "Lihat Invoice ›" })).toBeNull();
  });

  it("shows no cards for a creator without a contract", () => {
    render(<PeriodTabs creatorId={CREATOR} creatorName="Rangga Pratama" periods={[]} selected={null} earnings={null} />);

    expect(screen.queryByRole("region", { name: "Performa periode" })).toBeNull();
  });
});
