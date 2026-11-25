import { render, screen, within } from "@testing-library/react";
import { PeriodTabs } from "@/components/creator-detail/period-tabs";
import { toCreatorDetailView, type RawCreatorDetail } from "@/lib/creator-detail-api";
import { DEFAULT_CREATOR_DETAIL_PARAMS } from "@/lib/creator-detail";
import { CreatorTable } from "./creator-table";
import { creator } from "./creator.fixture";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/creators",
  useSearchParams: () => new URLSearchParams(),
}));

const CONTRACT = "22222222-2222-4222-8222-222222222222";

// The same contract, ended early, as GET /creators and GET /creators/:id send it (37.1): the list
// carries the current contract's earlyEnd, the detail every period's, the note included.
const LIST_ROW = creator({
  contract: {
    ...creator().contract,
    status: "expired",
    startDate: "2026-06-01",
    endDate: "2026-11-20",
    earlyEnd: { originalEndDate: "2026-12-31", reason: "fraud" },
  },
});

const DETAIL: RawCreatorDetail = {
  id: LIST_ROW.id,
  name: LIST_ROW.name,
  email: LIST_ROW.email,
  socials: {},
  contractHistory: [
    {
      id: CONTRACT,
      periodNumber: 1,
      type: "regular",
      startDate: "2026-06-01",
      endDate: "2026-11-20",
      status: "expired",
      contentQuota: 6,
      daysBetween: 14,
      fixedRate: 2_500_000,
      earlyEndReason: "fraud",
      earlyEnd: {
        originalEndDate: "2026-12-31",
        reason: "fraud",
        note: "Akun palsu",
        endedAt: "2026-11-20T03:00:00.000Z",
      },
      remainingEvergreenQuota: 0,
      progress: { submitted: 5, total: 6, percent: 83 },
      performance: { onTimeRate: 80, avgRevisions: 0.17, productivity: "good", productivityLabel: "Baik" },
      isCurrent: true,
    },
  ],
} as RawCreatorDetail;

/** The early-end lines a view shows, label first. */
function earlyEndLines(scope: HTMLElement): string[] {
  const label = within(scope).getByText("Berakhir Lebih Awal");
  return [...label.parentElement!.children].map((line) => line.textContent ?? "");
}

// PBI-37, 37.3: Creator Database and Creator Detail say the same of the same early end.
describe("an early end on Creator Database and on Creator Detail", () => {
  it("reads the same on both pages", () => {
    const { unmount } = render(<CreatorTable creators={[LIST_ROW]} total={1} />);
    const onList = earlyEndLines(screen.getAllByRole("row")[1]);
    unmount();

    const view = toCreatorDetailView(DETAIL, null, DEFAULT_CREATOR_DETAIL_PARAMS);
    render(<PeriodTabs creatorId={DETAIL.id} periods={view.periods} selected={view.selected!} />);
    const onDetail = earlyEndLines(screen.getByRole("navigation", { name: "Pilih periode kontrak" }));

    expect(onList).toEqual([
      "Berakhir Lebih Awal",
      "Berakhir lebih awal pada 20 Nov 2026, semula 31 Des 2026.",
      "Alasan: Fraud",
    ]);
    expect(onDetail).toEqual(onList);
  });

  // The note is the admin's own record on the contract (37.1); neither view lists it.
  it("leaves the admin's note out of the period tab", () => {
    const view = toCreatorDetailView(DETAIL, null, DEFAULT_CREATOR_DETAIL_PARAMS);
    render(<PeriodTabs creatorId={DETAIL.id} periods={view.periods} selected={view.selected!} />);

    expect(screen.queryByText(/Akun palsu/)).not.toBeInTheDocument();
  });
});
