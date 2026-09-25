import { render, screen } from "@testing-library/react";
import { fetchSubmissionQueue } from "@/lib/submissions";
import SubmissionsPage from "./page";

vi.mock("@/lib/submissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/submissions")>();
  return { ...actual, fetchSubmissionQueue: vi.fn() };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/submissions",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

const mockedFetch = vi.mocked(fetchSubmissionQueue);

async function renderPage(searchParams: Record<string, string> = {}) {
  const result = await SubmissionsPage({
    searchParams: Promise.resolve(searchParams) as Promise<Record<string, string | string[] | undefined>>,
  });
  const rendered = render(<>{result}</>);
  return { ...rendered };
}

describe("Antrian Draft page", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it("fetches queue with page=1 and default filters when no params", async () => {
    mockedFetch.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    });

    await renderPage({});

    expect(mockedFetch).toHaveBeenCalledWith(1, {
      q: undefined,
      status: "all",
      type: "all",
      overdue: false,
    });
  });

  it("renders the queue table and pagination when items exist", async () => {
    mockedFetch.mockResolvedValue({
      items: [
        {
          submissionId: "1",
          creatorName: "Salsa",
          contentName: "Evg_1",
          type: "Evergreen",
          deadline: "2026-09-15",
          status: "draft_review",
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });

    await renderPage({});

    expect(screen.getByText("Salsa")).toBeInTheDocument();
    expect(screen.getByText("Evg_1")).toBeInTheDocument();
    expect(screen.getByText("15 Sep 2026")).toBeInTheDocument();
  });

  it("shows load failed message when backend errors", async () => {
    mockedFetch.mockRejectedValue(new Error("fail"));

    await renderPage({});

    expect(screen.getByText(/antrian tidak bisa dimuat/i)).toBeInTheDocument();
  });

  it("shows invalid page message for bad page param", async () => {
    mockedFetch.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    });

    await renderPage({ page: "abc" });

    expect(screen.getByText(/halaman.*abc.*tidak dikenal/i)).toBeInTheDocument();
  });
});
