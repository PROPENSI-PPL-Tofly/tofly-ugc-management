import { fireEvent, render, screen } from "@testing-library/react";
import type { ContentPlanResponse } from "@/lib/content-plan";
import ContentPlanPage from "./page";

const { fetchPlan, fetchCreators } = vi.hoisted(() => ({
  fetchPlan: vi.fn(),
  fetchCreators: vi.fn(),
}));

vi.mock("@/lib/content-plan.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/content-plan.server")>()),
  fetchContentPlan: (state: unknown) => fetchPlan(state),
  fetchContentPlanCreatorOptions: () => fetchCreators(),
}));

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/content-plan",
  useSearchParams: () => searchParams,
}));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

function planOf(overrides: Partial<ContentPlanResponse> = {}): ContentPlanResponse {
  return {
    items: [
      {
        contentId: "content-1",
        name: "Evg_1_Salsa_15Sep2026",
        creatorId: "id-1",
        creatorName: "Salsa Wijaya",
        type: "evergreen",
        deadline: "2026-09-15",
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
  const result = await ContentPlanPage({
    searchParams: Promise.resolve(params) as Promise<
      Record<string, string | string[] | undefined>
    >,
  });
  return render(<>{result}</>);
}

describe("Content Plan page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    window.history.replaceState({}, "", "/admin/content-plan");
    fetchPlan.mockResolvedValue(planOf());
    fetchCreators.mockResolvedValue([{ id: "id-1", name: "Salsa Wijaya" }]);
  });

  it("titles the page and offers the four tabs with the counts the endpoint measured", async () => {
    fetchPlan.mockResolvedValue(
      planOf({ total: 42, totalPages: 5, counts: { all: 42, action: 3, waiting: 12, done: 27 } }),
    );

    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Content Plan" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Semua" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("count-action")).toHaveTextContent("3");
    expect(screen.getByTestId("count-waiting")).toHaveTextContent("12");
  });

  it("asks the backend for the URL's own parsed state, page one included", async () => {
    await renderPage({ tab: "action", q: "salsa", page: "2", status: "pending" });

    expect(fetchPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        tab: "action",
        q: "salsa",
        page: 2,
        status: ["pending"],
      }),
    );
  });

  it("lists the rows the endpoint returns, with their creators", async () => {
    await renderPage();

    expect(screen.getByText("Evg_1_Salsa_15Sep2026")).toBeInTheDocument();
    expect(screen.getByText("Salsa Wijaya")).toBeInTheDocument();
    expect(screen.getByText("Draft Menunggu Review")).toBeInTheDocument();
  });

  it("keeps the filters in the pagination links and counts the pieces", async () => {
    fetchPlan.mockResolvedValue(planOf({ total: 22, totalPages: 3 }));

    await renderPage({ q: "pw" });

    expect(screen.getByRole("link", { name: "Berikutnya" })).toHaveAttribute(
      "href",
      "/admin/content-plan?q=pw&page=2",
    );
    expect(screen.getByText("Menampilkan 1–10 dari 22 konten")).toBeInTheDocument();
  });

  it("shows the first page with a notice when the asked page is past the end", async () => {
    fetchPlan
      .mockResolvedValueOnce(planOf({ total: 22, totalPages: 3, counts: { all: 22, action: 0, waiting: 0, done: 22 } }))
      .mockResolvedValueOnce(planOf());

    await renderPage({ page: "99", q: "pw" });

    expect(fetchPlan).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, q: "pw" }));
    expect(screen.getByText(/halaman 99 tidak ada/i)).toBeInTheDocument();
    expect(screen.getByText("Evg_1_Salsa_15Sep2026")).toBeInTheDocument();
  });

  it("offers a retry that keeps the URL when the load fails", async () => {
    fetchPlan.mockRejectedValue(new Error("backend down"));

    await renderPage({ tab: "action", q: "salsa" });

    expect(screen.getByRole("alert")).toHaveTextContent(/tidak bisa dimuat/i);
    expect(screen.getByRole("link", { name: "Muat ulang" })).toHaveAttribute(
      "href",
      "/admin/content-plan?tab=action&q=salsa",
    );
  });

  it("hands every creator name to the filter bar", async () => {
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: /^Creator:/ }));

    expect(screen.getByRole("checkbox", { name: "Salsa Wijaya" })).toBeInTheDocument();
  });

  it("says the filter found nothing when a filter emptied the view", async () => {
    fetchPlan.mockResolvedValue(planOf({ items: [], total: 0, totalPages: 0, counts: { all: 0, action: 0, waiting: 0, done: 0 } }));

    await renderPage({ q: "zzz" });

    expect(screen.getByText("Tidak ada konten sesuai filter.")).toBeInTheDocument();
    expect(screen.queryByText("Belum ada konten.")).not.toBeInTheDocument();
  });
});
