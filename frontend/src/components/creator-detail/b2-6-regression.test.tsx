import type { ComponentType } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  CreatorContentRow,
  CreatorDetailParams,
  CreatorDetailView,
  CreatorPeriod,
  CreatorProfile,
  PeriodEarnings,
} from "@/lib/creator-detail";
import { CreatorContentBoard } from "./creator-content-board";
import { CreatorProfilePanel } from "./creator-profile";
import { PeriodTabs } from "./period-tabs";

const CREATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONTRACT = "22222222-2222-4222-8222-222222222222";
const PAGE = `/admin/creators/${CREATOR}`;
const { refresh, replace } = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
let boardSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
  usePathname: () => PAGE,
  useSearchParams: () => boardSearchParams,
}));

const PERIOD_BASE: CreatorPeriod = {
  contractId: CONTRACT,
  periodNumber: 2,
  type: "regular",
  startDate: "2026-06-01",
  endDate: "2026-12-31",
  status: "active",
  contentQuota: 6,
  evergreenCount: 3,
  remainingEvergreenQuota: 3,
  daysBetween: 14,
  progress: { submitted: 0, total: 6, percent: 0 },
  performance: { onTimeRate: null, avgRevisions: 0, productivity: "no_data", productivityLabel: "Belum Ada Data" },
};

const PERFORMANCE = {
  progress: { submitted: 2, total: 6, percent: 33 },
  performance: { onTimeRate: 50, avgRevisions: 1, productivity: "watch" as const, productivityLabel: "Perlu Perhatian" },
};

const CREATOR_PROFILE: CreatorProfile = {
  id: CREATOR,
  name: "Rangga Pratama",
  email: "rangga@example.com",
  socials: { instagram: "rangga.creates" },
  accessRevokeDate: null,
};

type Earnings = PeriodEarnings;
type PerformancePeriod = CreatorPeriod;
type PeriodTabsProps = {
  creatorId: string;
  creatorName: string;
  periods: readonly PerformancePeriod[];
  selected: PerformancePeriod | null;
  earnings: Earnings | null;
};
const PerformancePeriodTabs = PeriodTabs as unknown as ComponentType<PeriodTabsProps>;

function performanceTabs({
  period = { ...PERIOD_BASE, ...PERFORMANCE },
  earnings = { amount: 2_500_000, status: "finalized" },
}: { period?: PerformancePeriod; earnings?: Earnings | null } = {}) {
  render(
    <PerformancePeriodTabs
      creatorId={CREATOR}
      creatorName="Rangga Pratama"
      periods={[period]}
      selected={period}
      earnings={earnings}
    />,
  );
  return screen.getByRole("region", { name: "Performa periode" });
}

function card(region: HTMLElement, label: string) {
  return within(region).getByText(label).parentElement?.parentElement as HTMLElement;
}

describe("B2.6 period performance", () => {
  it("shows the five prototype cards in order using the selected period's values", () => {
    const region = performanceTabs();
    expect(within(region).getAllByRole("term").map((term) => term.childNodes[0].textContent)).toEqual([
      "Progres Konten",
      "Tepat Waktu",
      "Rata-rata Revisi",
      "Produktivitas",
      "Total Pendapatan",
    ]);
    expect(card(region, "Progres Konten")).toHaveTextContent("2/6");
    expect(within(region).getByRole("progressbar", { name: "Progres 33%" })).toHaveAttribute("value", "33");
    expect(card(region, "Tepat Waktu")).toHaveTextContent("50%");
    expect(card(region, "Rata-rata Revisi")).toHaveTextContent("1x");
    expect(card(region, "Produktivitas")).toHaveTextContent("Perlu Perhatian");
    expect(card(region, "Total Pendapatan")).toHaveTextContent("Rp2.500.000");
  });

  it("shows legitimate zero values and does not turn unavailable rates into zero", () => {
    const period = {
      ...PERIOD_BASE,
      progress: { submitted: 0, total: 6, percent: 0 },
      performance: { onTimeRate: null, avgRevisions: 0, productivity: "no_data" as const, productivityLabel: "Belum Ada Data" },
    };
    const region = performanceTabs({ period });
    expect(card(region, "Progres Konten")).toHaveTextContent("0/6");
    expect(within(region).getByRole("progressbar", { name: "Progres 0%" })).toHaveAttribute("value", "0");
    expect(card(region, "Tepat Waktu")).toHaveTextContent("—");
    expect(card(region, "Rata-rata Revisi")).toHaveTextContent("0x");
  });

  it("does not judge an upcoming period or claim earnings before its invoice is available", () => {
    const period = { ...PERIOD_BASE, ...PERFORMANCE, status: "upcoming" as const };
    const region = performanceTabs({ period, earnings: null });
    expect(card(region, "Produktivitas")).toHaveTextContent("Belum Dinilai");
    expect(card(region, "Total Pendapatan")).toHaveTextContent("—");
    expect(within(region).queryByRole("link", { name: /Lihat Invoice/ })).toBeNull();
  });

  it("links the selected creator's invoice and shows a real Rp0 distinctly from unavailable", () => {
    const region = performanceTabs({ earnings: { amount: 0, status: "accruing" } });
    expect(card(region, "Total Pendapatan")).toHaveTextContent("Rp0");
    expect(within(region).getByRole("link", { name: /Lihat Invoice/ })).toHaveAttribute(
      "href",
      "/admin/invoicing?q=Rangga+Pratama",
    );
  });

  it("switching the selected period changes metrics and earnings together", () => {
    const previous = {
      ...PERIOD_BASE,
      contractId: "11111111-1111-4111-8111-111111111111",
      periodNumber: 1,
      progress: { submitted: 1, total: 3, percent: 33 },
      performance: { onTimeRate: 100, avgRevisions: 0, productivity: "good" as const, productivityLabel: "Baik" },
    };
    render(
      <PerformancePeriodTabs
        creatorId={CREATOR}
        creatorName="Rangga Pratama"
        periods={[{ ...PERIOD_BASE, ...PERFORMANCE }, previous]}
        selected={previous}
        earnings={{ amount: 900_000, status: "paid" }}
      />,
    );
    const region = screen.getByRole("region", { name: "Performa periode" });
    expect(card(region, "Progres Konten")).toHaveTextContent("1/3");
    expect(card(region, "Tepat Waktu")).toHaveTextContent("100%");
    expect(card(region, "Total Pendapatan")).toHaveTextContent("Rp900.000");
    expect(screen.getByRole("link", { name: /Periode 1/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});

type AccessCreator = CreatorProfile & { accessRevokeDate: string | null | undefined };
type AccessProps = { creator: AccessCreator; current: CreatorPeriod | null; today: string };
const AccessProfile = CreatorProfilePanel as unknown as ComponentType<AccessProps>;

describe("B2.6 creator access display", () => {
  function renderAccess(accessRevokeDate: string | null | undefined, current: CreatorPeriod | null = PERIOD_BASE) {
    render(<AccessProfile creator={{ ...CREATOR_PROFILE, accessRevokeDate }} current={current} today="2026-10-21" />);
    return screen.getByText("Akses").nextElementSibling as HTMLElement;
  }

  it("says active access in words and with a status marker", () => {
    const access = renderAccess(null);
    expect(access).toHaveTextContent("Aktif");
    expect(access.querySelector('[aria-hidden="true"]')).toHaveClass("bg-green");
  });

  it("explains a future revocation date without claiming access has ended", () => {
    const access = renderAccess("2026-11-15");
    expect(access).toHaveTextContent("Aktif");
    expect(access).toHaveTextContent("Dicabut mulai 15 Nov 2026");
    expect(access.querySelector('[aria-hidden="true"]')).toHaveClass("bg-amber");
  });

  it("treats the revoke date itself as revoked and explains early cutoff", () => {
    const access = renderAccess("2026-10-21");
    expect(access).toHaveTextContent("Dicabut");
    expect(access).toHaveTextContent("Sejak 21 Okt 2026, sebelum kontrak berakhir (31 Des 2026)");
    expect(access.querySelector('[aria-hidden="true"]')).toHaveClass("bg-red");
  });

  it("shows revoked access even without contract details", () => {
    const access = renderAccess("2026-10-01", null);
    expect(access).toHaveTextContent("Sejak 1 Okt 2026");
    expect(access).not.toHaveTextContent("sebelum kontrak berakhir");
  });

  it("does not claim active access when the API omitted its access field", () => {
    const access = renderAccess(undefined);
    expect(access).toHaveTextContent("Tidak diketahui");
    expect(access).toHaveTextContent("Informasi akses tidak tersedia.");
  });
});

const LATE_DONE: CreatorContentRow = {
  contentId: "content-done-late",
  name: "Late hand-in",
  type: "specific",
  deadline: "2026-10-01",
  status: "link_submitted",
  tags: ["overdue"],
  revisionCount: 0,
};

const EXTRA_VIEW = {
  creator: CREATOR_PROFILE,
  periods: [PERIOD_BASE],
  selected: PERIOD_BASE,
  rows: [LATE_DONE],
  page: 1,
  total: 1,
  totalPages: 1,
  counts: { all: 1, action: 0, waiting: 0, done: 1 },
  calendar: [LATE_DONE],
  earnings: null,
} as unknown as CreatorDetailView;

const EXTRA_STATE = {
  contract: CONTRACT,
  tab: "all",
  q: "",
  type: [],
  status: [],
  overdue: "all",
  sort: "asc",
  page: 1,
} as unknown as CreatorDetailParams;

describe("B2.6 content calendar and table conventions", () => {
  it("places the period calendar before the content table and provides the Content Plan tabs", () => {
    render(<CreatorContentBoard creatorId={CREATOR} view={EXTRA_VIEW} state={EXTRA_STATE} />);
    const calendar = screen.getByRole("heading", { level: 2, name: "Jadwal Konten" });
    const tabs = screen.getByRole("tablist", { name: "Tab konten periode" });
    const table = within(screen.getByRole("tabpanel")).getByRole("table");
    expect(calendar.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tabs.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Selesai" })).toBeInTheDocument();
    expect(screen.queryByTestId("count-action")).toBeNull();
    expect(screen.getByTestId("count-waiting")).toHaveTextContent("0");
  });

  it("keeps late submitted content in Selesai and omits actions that no longer apply", () => {
    render(<CreatorContentBoard creatorId={CREATOR} view={EXTRA_VIEW} state={{ ...EXTRA_STATE, tab: "done" } as CreatorDetailParams} />);
    expect(screen.getAllByText("Late hand-in").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Tinjau/ })).toBeNull();
    expect(screen.getByRole("tab", { name: "Selesai" })).toHaveAttribute("aria-selected", "true");
  });

  it("sorts the selected period's deadlines from the table header", () => {
    vi.clearAllMocks();
    boardSearchParams = new URLSearchParams(`contract=${CONTRACT}&page=2&sort=asc`);
    const original = replace.mock.calls.length;
    render(<CreatorContentBoard creatorId={CREATOR} view={EXTRA_VIEW} state={EXTRA_STATE} />);
    const sort = screen.queryByRole("button", { name: /Deadline/ });
    expect(sort).not.toBeNull();
    fireEvent.click(sort!);
    expect(replace.mock.calls.length).toBeGreaterThan(original);
    expect(replace.mock.lastCall?.[0]).toContain("sort=desc");
    expect(replace.mock.lastCall?.[0]).not.toContain("page=2");
  });

  it("shows the period's unallocated Evergreen quota only when there is room left", () => {
    render(<CreatorContentBoard creatorId={CREATOR} view={EXTRA_VIEW} state={EXTRA_STATE} />);
    expect(screen.getByText(/3 .*Evergreen.*belum dialokasikan/i)).toBeInTheDocument();
  });
});
