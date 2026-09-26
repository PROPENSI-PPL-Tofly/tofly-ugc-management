import { render, screen, within } from "@testing-library/react";
import { fetchMyTasks, MyTasksError, type MyTasksResponse } from "@/lib/my-tasks";
import TaskSayaPage from "./page";

vi.mock("@/lib/my-tasks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/my-tasks")>();
  return { ...actual, fetchMyTasks: vi.fn() };
});

vi.mock("next/navigation", () => ({ usePathname: () => "/creator/tasks" }));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

const mockedFetch = vi.mocked(fetchMyTasks);

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
        actions: ["submit_draft"],
      },
    ],
    page: 1,
    pageSize: 5,
    total: 6,
    totalPages: 2,
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
  });

  it("opens in the creator frame under the Task Saya title", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Task Saya" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Menu creator" })).toBeInTheDocument();
  });

  it("asks for the first page when the URL names none", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage();

    expect(mockedFetch).toHaveBeenCalledWith(1);
  });

  it("asks for the page the URL names", async () => {
    mockedFetch.mockResolvedValue(answer({ page: 2 }));

    await renderPage({ page: "2" });

    expect(mockedFetch).toHaveBeenCalledWith(2);
  });

  it("lists the tasks with their actions and pages through them five at a time", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage();

    const table = screen.getByRole("table", { name: "Daftar Tugas Saya" });
    expect(within(table).getByText("Evg_1_RanggaPratama_12102026")).toBeInTheDocument();
    expect(screen.getByText("Menampilkan 1–5 dari 6 tugas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Berikutnya" })).toHaveAttribute(
      "href",
      "/creator/tasks?page=2",
    );
  });

  // The Submit Draft / Submit Link Video modals (SCRUM-109, SCRUM-132) are not wired in yet.
  it("shows the actions but keeps them unpressable until their modals exist", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage();

    expect(screen.getByRole("button", { name: /Submit Draft/ })).toBeDisabled();
  });

  it("falls back to the first page, and says so, for a page that is not a number", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage({ page: "abc" });

    expect(mockedFetch).toHaveBeenCalledWith(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Halaman “abc” tidak dikenal, menampilkan halaman pertama.",
    );
  });

  it("shows the first page, and says so, for a page past the end", async () => {
    mockedFetch
      .mockResolvedValueOnce(answer({ items: [], page: 9, totalPages: 2 }))
      .mockResolvedValueOnce(answer());

    await renderPage({ page: "9" });

    expect(mockedFetch).toHaveBeenNthCalledWith(2, 1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Halaman 9 tidak ada, menampilkan halaman pertama.",
    );
    expect(screen.getByText("Evg_1_RanggaPratama_12102026")).toBeInTheDocument();
  });

  it("says there are no tasks yet without a pager", async () => {
    mockedFetch.mockResolvedValue(answer({ items: [], total: 0, totalPages: 0 }));

    await renderPage();

    expect(screen.getByText("Belum ada tugas untuk kamu.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Berikutnya" })).not.toBeInTheDocument();
  });

  it("tells a visitor who is not signed in as a creator, instead of a broken table", async () => {
    mockedFetch.mockRejectedValue(new MyTasksError(401));

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Kamu belum masuk sebagai creator.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it.each([
    ["a server error", new MyTasksError(500)],
    ["an unreachable backend", new TypeError("fetch failed")],
  ])("offers a reload after %s", async (_label, failure) => {
    mockedFetch.mockRejectedValue(failure);

    await renderPage();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Daftar tugas tidak bisa dimuat.");
    expect(within(alert).getByRole("link", { name: "Muat ulang" })).toHaveAttribute(
      "href",
      "/creator/tasks",
    );
  });
});
