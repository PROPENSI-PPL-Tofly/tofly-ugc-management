import { fireEvent, render, screen, within } from "@testing-library/react";
import { MyTasksError, type MyTasksResponse } from "@/lib/my-tasks";
import { fetchMyTasks } from "@/lib/my-tasks.server";
import TaskSayaPage from "./page";

vi.mock("@/lib/my-tasks.server", () => ({
  fetchMyTasks: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/creator/tasks",
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

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
        tags: [],
        actions: ["submit_draft"],
        revisionNotes: null,
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

    expect(mockedFetch).toHaveBeenCalledWith(1, null);
  });

  it("asks for the page the URL names", async () => {
    mockedFetch.mockResolvedValue(answer({ page: 2 }));

    await renderPage({ page: "2" });

    expect(mockedFetch).toHaveBeenCalledWith(2, null);
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

  it("opens the Submit Draft modal from a task's button", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Submit Draft/ }));

    expect(screen.getByRole("dialog", { name: "Submit Draft" })).toBeInTheDocument();
  });

  it("falls back to the first page, and says so, for a page that is not a number", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage({ page: "abc" });

    expect(mockedFetch).toHaveBeenCalledWith(1, null);
    expect(screen.getByRole("status")).toHaveTextContent(
        "Halaman “abc” tidak dikenal, menampilkan halaman pertama.",
    );
  });

  it("shows the first page, and says so, for a page past the end", async () => {
    mockedFetch
        .mockResolvedValueOnce(answer({ items: [], page: 9, totalPages: 2 }))
        .mockResolvedValueOnce(answer());

    await renderPage({ page: "9" });

    expect(mockedFetch).toHaveBeenNthCalledWith(2, 1, null);
    expect(screen.getByRole("status")).toHaveTextContent(
        "Halaman 9 tidak ada, menampilkan halaman pertama.",
    );
    expect(screen.getByText("Evg_1_RanggaPratama_12102026")).toBeInTheDocument();
  });

  describe("status filter", () => {
    it("asks for the status the URL filters by and shows it in the filter", async () => {
      mockedFetch.mockResolvedValue(answer());

      await renderPage({ status: "draft_revision", page: "2" });

      expect(mockedFetch).toHaveBeenCalledWith(2, "draft_revision");
      expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("draft_revision");
    });

    it("keeps the filter when paging", async () => {
      mockedFetch.mockResolvedValue(answer());

      await renderPage({ status: "scheduled" });

      expect(screen.getByRole("link", { name: "Berikutnya" })).toHaveAttribute(
          "href",
          "/creator/tasks?status=scheduled&page=2",
      );
    });

    it("keeps the filter when a page past the end falls back to the first", async () => {
      mockedFetch
          .mockResolvedValueOnce(answer({ items: [], page: 9, totalPages: 2 }))
          .mockResolvedValueOnce(answer());

      await renderPage({ status: "scheduled", page: "9" });

      expect(mockedFetch).toHaveBeenNthCalledWith(2, 1, "scheduled");
    });

    it("lists every task, and says so, for a status it does not know", async () => {
      mockedFetch.mockResolvedValue(answer());

      await renderPage({ status: "done" });

      expect(mockedFetch).toHaveBeenCalledWith(1, null);
      expect(screen.getByRole("status")).toHaveTextContent(
          "Status “done” tidak dikenal, menampilkan semua tugas.",
      );
    });

    it("says which status found nothing, keeping the filter to change it", async () => {
      mockedFetch.mockResolvedValue(answer({ items: [], total: 0, totalPages: 1 }));

      await renderPage({ status: "draft_approved" });

      expect(screen.getByText("Tidak ada tugas berstatus Draft Approved.")).toBeInTheDocument();
      expect(screen.queryByText("Belum ada tugas untuk kamu.")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Tampilkan semua tugas" })).toHaveAttribute(
        "href",
        "/creator/tasks",
      );
      expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    });
  });

  it("says there are no tasks yet without a pager", async () => {
    mockedFetch.mockResolvedValue(answer({ items: [], total: 0, totalPages: 0 }));

    await renderPage();

    expect(screen.getByText("Belum ada tugas untuk kamu.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Berikutnya" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tampilkan semua tugas" })).not.toBeInTheDocument();
  });

  it("tells a visitor who is not signed in as a creator, instead of a broken table", async () => {
    mockedFetch.mockRejectedValue(new MyTasksError(401));

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
        "Kamu belum masuk sebagai creator.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Masuk" })).toHaveAttribute("href", "/login");
  });

  it.each([
    ["a server error", new MyTasksError(500)],
    ["an unusable answer", new MyTasksError(502)],
    ["an unreachable backend", new TypeError("fetch failed")],
  ])("offers a reload after %s", async (_label, failure) => {
    mockedFetch.mockRejectedValue(failure);

    await renderPage();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Daftar tugas tidak bisa dimuat.");
    expect(alert).toHaveTextContent("Coba muat ulang beberapa saat lagi.");
    expect(alert).not.toHaveTextContent("Server tidak menjawab.");
    expect(within(alert).getByRole("link", { name: "Muat ulang" })).toHaveAttribute(
        "href",
        "/creator/tasks",
    );
  });
});