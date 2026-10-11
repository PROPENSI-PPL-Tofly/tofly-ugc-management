import { fireEvent, render, screen, within } from "@testing-library/react";
import { DEFAULT_MY_TASKS_PARAMS, MyTasksError, type MyTasksResponse } from "@/lib/my-tasks";
import { fetchMyTasks } from "@/lib/my-tasks.server";
import TaskSayaPage from "./page";

vi.mock("@/lib/my-tasks.server", () => ({
  fetchMyTasks: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/creator/tasks",
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

const mockedFetch = vi.mocked(fetchMyTasks);

/** Named periods are counted from today in Jakarta, which the page works out itself. */
const TODAY = expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/);

function answer(overrides: Partial<MyTasksResponse> = {}): MyTasksResponse {
  return {
    items: [
      {
        id: "content-1",
        name: "Evg_1_RanggaPratama_12102026",
        type: "evergreen",
        brief: "",
        deadline: "2026-10-12",
        status: "scheduled",
        tags: [],
        actions: ["submit_draft"],
        revisionNotes: null,
      },
    ],
    page: 1,
    pageSize: 10,
    total: 11,
    totalPages: 2,
    counts: { all: 11, action: 6, waiting: 2, done: 3 },
    ...overrides,
  };
}

async function renderPage(searchParams: Record<string, string> = {}) {
  const page = await TaskSayaPage({
    searchParams: Promise.resolve(searchParams) as Promise<
        Record<string, string | string[] | undefined>
    >,
  });
  return render(<>{page}</>);
}

describe("Task Saya page", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    window.history.pushState({}, "", "/creator/tasks");
  });

  it("opens in the creator frame under the Task Saya title", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Task Saya" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Menu creator" })).toBeInTheDocument();
  });

  it("asks for Semua's first page, nearest deadline first, when the URL names nothing", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage();

    expect(mockedFetch).toHaveBeenCalledWith(DEFAULT_MY_TASKS_PARAMS, TODAY);
  });

  it("asks for the tab, filters, sort and page the URL names", async () => {
    mockedFetch.mockResolvedValue(answer({ page: 2 }));

    await renderPage({ tab: "action", status: "draft_revision", sort: "desc", page: "2" });

    expect(mockedFetch).toHaveBeenCalledWith(
      { ...DEFAULT_MY_TASKS_PARAMS, tab: "action", status: ["draft_revision"], sort: "desc", page: 2 },
      TODAY,
    );
  });

  it("shows every tab with its counter, the one in the URL selected", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage({ tab: "waiting" });

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Semua",
      "Perlu Dikerjakan6",
      "Menunggu Admin2",
      "Selesai",
    ]);
    expect(screen.getByRole("tab", { name: "Menunggu Admin2" })).toHaveAttribute("aria-selected", "true");
  });

  it("lists the tasks with their actions and pages through them ten at a time, keeping the view", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage({ tab: "action", q: "serum" });

    const table = screen.getByRole("table", { name: "Daftar Tugas Saya" });
    expect(within(table).getByText("Evg_1_RanggaPratama_12102026")).toBeInTheDocument();
    expect(screen.getByText("Menampilkan 1–10 dari 11 tugas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Berikutnya" })).toHaveAttribute(
        "href",
        "/creator/tasks?tab=action&q=serum&page=2",
    );
  });

  it("shows the filter bar and the sortable deadline header", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage();

    expect(screen.getByRole("searchbox", { name: "Cari judul konten" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Deadline/ })).toHaveAttribute("aria-sort", "ascending");
  });

  it("opens the Submit Draft modal from a task's button", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Submit Draft/ }));

    expect(screen.getByRole("dialog", { name: "Submit Draft" })).toBeInTheDocument();
  });

  it("falls back to the first page, and says so, for a page that is not a number", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage({ page: "abc" });

    expect(mockedFetch).toHaveBeenCalledWith(DEFAULT_MY_TASKS_PARAMS, TODAY);
    expect(screen.getByRole("status")).toHaveTextContent(
        "Halaman “abc” tidak dikenal, menampilkan halaman pertama.",
    );
  });

  it("shows the first page of the same view, and says so, for a page past the end", async () => {
    mockedFetch
        .mockResolvedValueOnce(answer({ items: [], page: 9, totalPages: 2 }))
        .mockResolvedValueOnce(answer());

    await renderPage({ tab: "done", page: "9" });

    expect(mockedFetch).toHaveBeenNthCalledWith(2, { ...DEFAULT_MY_TASKS_PARAMS, tab: "done" }, TODAY);
    expect(screen.getByRole("status")).toHaveTextContent(
        "Halaman 9 tidak ada, menampilkan halaman pertama.",
    );
    expect(screen.getByText("Evg_1_RanggaPratama_12102026")).toBeInTheDocument();
  });

  it("lists without a status it does not know, and says so", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage({ status: "pending" });

    expect(mockedFetch).toHaveBeenCalledWith(DEFAULT_MY_TASKS_PARAMS, TODAY);
    expect(screen.getByRole("status")).toHaveTextContent(
        "Status “pending” tidak dikenal, menampilkan semua tugas.",
    );
  });

  it("says the filter matched nothing, keeping the tabs and the bar to change it, without a pager", async () => {
    mockedFetch.mockResolvedValue(answer({ items: [], total: 0, totalPages: 1 }));

    await renderPage({ tab: "action", overdue: "yes" });

    expect(screen.getByText("Tidak ada konten sesuai filter.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset filter" })).toBeInTheDocument();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Berikutnya" })).not.toBeInTheDocument();
  });

  it("says there are no tasks yet without a pager", async () => {
    mockedFetch.mockResolvedValue(
      answer({ items: [], total: 0, totalPages: 0, counts: { all: 0, action: 0, waiting: 0, done: 0 } }),
    );

    await renderPage();

    expect(screen.getByText("Belum ada task.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Berikutnya" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset filter" })).not.toBeInTheDocument();
  });

  it("tells a visitor who is not signed in as a creator, instead of a broken table", async () => {
    mockedFetch.mockRejectedValue(new MyTasksError(401));

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
        "Kamu belum masuk sebagai creator.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Masuk" })).toHaveAttribute("href", "/login");
  });

  it.each([
    ["a server error", new MyTasksError(500)],
    ["an unusable answer", new MyTasksError(502)],
    ["an unreachable backend", new TypeError("fetch failed")],
  ])("offers a reload of the same view after %s", async (_label, failure) => {
    mockedFetch.mockRejectedValue(failure);

    await renderPage({ tab: "done" });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Daftar tugas tidak bisa dimuat.");
    expect(alert).toHaveTextContent("Coba muat ulang beberapa saat lagi.");
    expect(within(alert).getByRole("link", { name: "Muat ulang" })).toHaveAttribute(
        "href",
        "/creator/tasks?tab=done",
    );
  });

  it("falls back to an error, not a broken table, when the first page fails after a page past the end", async () => {
    mockedFetch
        .mockResolvedValueOnce(answer({ items: [], page: 9, totalPages: 2 }))
        .mockRejectedValueOnce(new MyTasksError(500));

    await renderPage({ page: "9" });

    expect(screen.getByRole("alert")).toHaveTextContent("Daftar tugas tidak bisa dimuat.");
  });
});
