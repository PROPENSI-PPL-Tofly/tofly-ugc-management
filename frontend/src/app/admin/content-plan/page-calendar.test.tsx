import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ContentPlanResponse } from "@/lib/content-plan";
import ContentPlanPage from "./page";

const { fetchPlan, fetchMonth, fetchCreators, replace } = vi.hoisted(() => ({
  fetchPlan: vi.fn(),
  fetchMonth: vi.fn(),
  fetchCreators: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/content-plan.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/content-plan.server")>()),
  fetchContentPlan: (state: unknown) => fetchPlan(state),
  fetchContentPlanMonth: (state: unknown, month: unknown) =>
    fetchMonth(state, month),
  fetchContentPlanCreatorOptions: () => fetchCreators(),
}));

// Today, pinned: 12 November 2026 in Jakarta.
vi.mock("@/lib/format", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/format")>()),
  jakartaDay: () => "2026-11-12",
}));

// The panel loads its own detail; here only its opening and closing matter.
vi.mock("@/components/content-detail/content-detail-panel", () => ({
  DECISION_CONFIRMATIONS: {},
  ContentDetailPanel: ({
    contentId,
    onClose,
  }: {
    contentId: string;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label={`Detail ${contentId}`}>
      <button type="button" onClick={onClose}>
        Tutup
      </button>
    </div>
  ),
}));

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
  usePathname: () => "/admin/content-plan",
  useSearchParams: () => searchParams,
}));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

function planOf(
  overrides: Partial<ContentPlanResponse> = {},
): ContentPlanResponse {
  return {
    items: [
      {
        platforms: [],
        contentId: "content-1",
        name: "Review Serum",
        creatorId: "id-1",
        creatorName: "Salsa Wijaya",
        type: "specific",
        deadline: "2026-11-20",
        status: "draft_review",
        tags: [],
        revisionCount: 0,
      },
    ],
    total: 1,
    totalPages: 1,
    counts: { all: 1, action: 1, waiting: 0, done: 0 },
    ...overrides,
  };
}

async function renderPage(params: Record<string, string> = {}) {
  searchParams = new URLSearchParams(params);
  const search = searchParams.toString();
  window.history.replaceState(
    {},
    "",
    `/admin/content-plan${search ? `?${search}` : ""}`,
  );
  const result = await ContentPlanPage({
    searchParams: Promise.resolve(params) as Promise<
      Record<string, string | string[] | undefined>
    >,
  });
  return render(<>{result}</>);
}

describe("Content Plan page — Tabel / Kalender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPlan.mockResolvedValue(planOf());
    fetchMonth.mockResolvedValue(planOf());
    fetchCreators.mockResolvedValue([{ id: "id-1", name: "Salsa Wijaya" }]);
  });

  it("opens on the table with its pagination, offering the toggle", async () => {
    fetchPlan.mockResolvedValue(planOf({ total: 22, totalPages: 3 }));
    await renderPage();

    expect(screen.getByRole("link", { name: "Tabel" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(fetchPlan).toHaveBeenCalled();
    expect(fetchMonth).not.toHaveBeenCalled();
    expect(screen.getByText(/^Menampilkan/)).toBeInTheDocument();
  });

  it("shows the calendar for today's month without pagination", async () => {
    fetchMonth.mockResolvedValue(planOf({ total: 22, totalPages: 3 }));
    await renderPage({ view: "calendar" });

    expect(fetchPlan).not.toHaveBeenCalled();
    expect(fetchMonth).toHaveBeenCalledWith(
      expect.objectContaining({ view: "calendar" }),
      { year: 2026, month: 11 },
    );
    expect(
      screen.getByRole("heading", { name: "November 2026" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Menampilkan/)).toBeNull();
  });

  it("shows the address's month, and today's when the month is not a month (OWASP A10)", async () => {
    await renderPage({ view: "calendar", month: "2027-02" });
    expect(fetchMonth).toHaveBeenLastCalledWith(expect.anything(), {
      year: 2027,
      month: 2,
    });

    await renderPage({ view: "calendar", month: "2027-13" });
    expect(fetchMonth).toHaveBeenLastCalledWith(expect.anything(), {
      year: 2026,
      month: 11,
    });
  });

  it("keeps the status tabs and the search and filters on the calendar", async () => {
    await renderPage({
      view: "calendar",
      tab: "action",
      q: "serum",
      type: "specific",
      overdue: "yes",
    });

    expect(fetchMonth).toHaveBeenCalledWith(
      expect.objectContaining({
        tab: "action",
        q: "serum",
        type: ["specific"],
        overdue: "yes",
      }),
      expect.anything(),
    );
    expect(screen.getByRole("tab", { name: /Perlu Approval/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByRole("searchbox").length).toBeGreaterThan(0);
  });

  it("switching tab on the calendar keeps the view and month", async () => {
    await renderPage({ view: "calendar", month: "2026-12", q: "serum" });

    fireEvent.click(screen.getByRole("tab", { name: /Selesai/ }));

    expect(replace).toHaveBeenCalledWith(
      "/admin/content-plan?tab=done&q=serum&view=calendar&month=2026-12",
      expect.anything(),
    );
  });

  it("resetting the filters on the calendar keeps the tab, view and month", async () => {
    await renderPage({
      view: "calendar",
      month: "2026-12",
      tab: "waiting",
      type: "specific",
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(replace).toHaveBeenCalledWith(
      "/admin/content-plan?tab=waiting&view=calendar&month=2026-12",
      expect.anything(),
    );
  });

  it("opens a chip's content in the detail panel by ?content= and closing returns to the same calendar", async () => {
    await renderPage({ view: "calendar", month: "2026-11", type: "specific" });

    fireEvent.click(
      within(screen.getByRole("table")).getByRole("button", {
        name: /^Review Serum/,
      }),
    );

    // The panel's link is written straight into the address, with no navigation.
    expect(
      screen.getByRole("dialog", { name: "Detail content-1" }),
    ).toBeInTheDocument();
    const opened = new URLSearchParams(window.location.search);
    expect(opened.get("content")).toBe("content-1");
    expect(opened.get("view")).toBe("calendar");
    expect(opened.get("month")).toBe("2026-11");

    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    const closed = new URLSearchParams(window.location.search);
    expect(Object.fromEntries(closed)).toEqual({
      type: "specific",
      view: "calendar",
      month: "2026-11",
    });
  });

  it("says plainly when the month is too large to show whole, rather than truncating it (OWASP A06)", async () => {
    const { ContentPlanCalendarTooLargeError } =
      await import("@/lib/content-plan.server");
    fetchMonth.mockRejectedValue(new ContentPlanCalendarTooLargeError(25));

    await renderPage({ view: "calendar" });

    expect(screen.getByText("Kalender tidak bisa dimuat.")).toBeInTheDocument();
    expect(screen.getByText(/lebih dari 1\.000 konten/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("offers a retry back to the same calendar when the API fails (OWASP A10)", async () => {
    fetchMonth.mockRejectedValue(new Error("HTTP 503"));

    await renderPage({ view: "calendar", month: "2026-12" });

    expect(
      screen.getByText("Content Plan tidak bisa dimuat."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Muat ulang" })).toHaveAttribute(
      "href",
      "/admin/content-plan?view=calendar&month=2026-12",
    );
  });
});
