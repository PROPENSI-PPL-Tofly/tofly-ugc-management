import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  DEFAULT_MY_TASKS_PARAMS,
  MY_TASKS_EMPTY,
  MyTasksError,
  type MyTasksResponse,
} from "@/lib/my-tasks";
import { fetchMyTasks } from "@/lib/my-tasks.server";
import { fetchAllMyTasks } from "@/lib/task-calendar.server";
import TaskSayaPage from "./page";

vi.mock("@/lib/my-tasks.server", () => ({
  fetchMyTasks: vi.fn(),
}));

vi.mock("@/lib/task-calendar.server", () => ({
  fetchAllMyTasks: vi.fn(),
}));

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/creator/tasks",
  useRouter: () => ({ refresh: vi.fn(), replace }),
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
        "Status “pending” tidak dikenal dan diabaikan.",
    );
  });

  // The statuses it does know still narrow the list, so the notice must not claim otherwise.
  it("names every status it does not know, and keeps the ones it does", async () => {
    mockedFetch.mockResolvedValue(answer());

    await renderPage({ status: "pending,scheduled,bogus" });

    expect(mockedFetch).toHaveBeenCalledWith(
        { ...DEFAULT_MY_TASKS_PARAMS, status: ["scheduled"] },
        TODAY,
    );
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Status “pending”, “bogus” tidak dikenal dan diabaikan.");
    expect(notice).not.toHaveTextContent("semua tugas");
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

describe("Task Saya page views", () => {
  const mockedFetchAll = vi.mocked(fetchAllMyTasks);

  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetchAll.mockReset();
    replace.mockClear();
    mockedFetch.mockResolvedValue(answer());
    mockedFetchAll.mockResolvedValue({ tasks: answer().items, counts: answer().counts });
    // Midday in Jakarta on 9 Oct 2026, so "today" is the same day whatever zone the test runs in.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T05:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function switchLink(name: string) {
    return within(screen.getByRole("group", { name: "Tampilan tugas" })).getByRole("link", { name });
  }

  /** Renders the page at an address, which is also what its client controls read. */
  async function renderAt(searchParams: Record<string, string>) {
    window.history.pushState({}, "", `/creator/tasks?${new URLSearchParams(searchParams)}`);
    return renderPage(searchParams);
  }

  it("offers the Tabel / Kalender switch, on the table unless asked otherwise", async () => {
    await renderPage();

    expect(switchLink("Tabel")).toHaveAttribute("aria-current", "page");
    expect(switchLink("Kalender")).toHaveAttribute("href", "/creator/tasks?view=calendar");
  });

  it("does not read every task for the table, only its page", async () => {
    await renderPage();

    expect(mockedFetchAll).not.toHaveBeenCalled();
    expect(mockedFetch).toHaveBeenCalledWith(DEFAULT_MY_TASKS_PARAMS, TODAY);
  });

  it("shows this month's calendar with every task when the address asks for it", async () => {
    await renderPage({ view: "calendar" });

    expect(switchLink("Kalender")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Oktober 2026" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Evg_1_RanggaPratama_12102026 · Scheduled" }),
    ).toBeInTheDocument();
    expect(mockedFetchAll).toHaveBeenCalledExactlyOnceWith(DEFAULT_MY_TASKS_PARAMS, TODAY);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  describe("a deadline range carried onto the calendar", () => {
    it("keeps the range on the switch from the table to the calendar", async () => {
      await renderPage({ period: "custom", from: "2026-12-03", to: "2026-12-20" });

      expect(switchLink("Kalender")).toHaveAttribute(
        "href",
        "/creator/tasks?period=custom&from=2026-12-03&to=2026-12-20&view=calendar",
      );
    });

    it("opens the calendar on the month the range starts in", async () => {
      await renderPage({ view: "calendar", period: "custom", from: "2026-12-03", to: "2027-01-20" });

      expect(screen.getByRole("heading", { name: "Desember 2026" })).toBeInTheDocument();
    });

    it("opens on the month of the end day when only the end is picked", async () => {
      await renderPage({ view: "calendar", period: "custom", to: "2027-01-15" });

      expect(screen.getByRole("heading", { name: "Januari 2027" })).toBeInTheDocument();
    });

    it("opens on the earlier day of a range picked backwards, as the list reads it", async () => {
      await renderPage({ view: "calendar", period: "custom", from: "2027-02-10", to: "2026-12-03" });

      expect(screen.getByRole("heading", { name: "Desember 2026" })).toBeInTheDocument();
    });

    it("opens on the earlier day of a backwards range that crosses into the next year", async () => {
      await renderPage({ view: "calendar", period: "custom", from: "2027-01-02", to: "2026-12-31" });

      expect(screen.getByRole("heading", { name: "Desember 2026" })).toBeInTheDocument();
    });

    it("opens on the month of the start day when only the start is picked", async () => {
      await renderPage({ view: "calendar", period: "custom", from: "2027-03-05" });

      expect(screen.getByRole("heading", { name: "Maret 2027" })).toBeInTheDocument();
    });

    it("stays on this month while Pilih tanggal is chosen but no day is picked yet", async () => {
      await renderPage({ view: "calendar", period: "custom" });

      expect(screen.getByRole("heading", { name: "Oktober 2026" })).toBeInTheDocument();
    });

    it("stays on this month for a day the period does not use", async () => {
      await renderPage({ view: "calendar", period: "next30", from: "2026-12-03" });

      expect(screen.getByRole("heading", { name: "Oktober 2026" })).toBeInTheDocument();
    });
  });

  it("shows no pager on the calendar: a month is not paged", async () => {
    await renderPage({ view: "calendar" });

    expect(screen.queryByRole("link", { name: "Berikutnya" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sebelumnya" })).not.toBeInTheDocument();
  });

  it("keeps the tabs and their counters above the calendar", async () => {
    await renderPage({ view: "calendar", tab: "waiting" });

    const tabs = screen.getByRole("tablist", { name: "Tab Task Saya" });
    expect(within(tabs).getByRole("tab", { name: /Menunggu Admin/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(tabs).getByRole("tab", { name: /Perlu Dikerjakan/ })).toHaveTextContent("6");
  });

  it("keeps the tab, search and filters on the calendar, in what it loads and in the switch", async () => {
    await renderPage({ view: "calendar", tab: "action", q: "evg", status: "scheduled", page: "2" });

    expect(mockedFetchAll).toHaveBeenCalledExactlyOnceWith(
      { ...DEFAULT_MY_TASKS_PARAMS, tab: "action", q: "evg", status: ["scheduled"], page: 2 },
      TODAY,
    );
    expect(switchLink("Tabel")).toHaveAttribute(
      "href",
      "/creator/tasks?tab=action&q=evg&status=scheduled",
    );
  });

  it("carries the tab and filters from the table over to the calendar, without the page", async () => {
    await renderPage({ tab: "done", type: "evergreen", page: "2" });

    expect(switchLink("Kalender")).toHaveAttribute(
      "href",
      "/creator/tasks?tab=done&type=evergreen&view=calendar",
    );
  });

  it("stays on the calendar when a filter is changed there", async () => {
    await renderAt({ view: "calendar" });

    fireEvent.change(screen.getByRole("combobox", { name: "Overdue" }), {
      target: { value: "yes" },
    });

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/creator/tasks?view=calendar&overdue=yes",
      { scroll: false },
    );
  });

  it("stays on the calendar when another tab is pressed there", async () => {
    await renderAt({ view: "calendar" });

    fireEvent.click(screen.getByRole("tab", { name: /Selesai/ }));

    expect(replace).toHaveBeenCalledExactlyOnceWith("/creator/tasks?tab=done&view=calendar", {
      scroll: false,
    });
  });

  it("stays on the calendar, and on its tab, when the filters are reset there", async () => {
    await renderAt({ view: "calendar", tab: "waiting", overdue: "yes" });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(replace).toHaveBeenCalledExactlyOnceWith("/creator/tasks?tab=waiting&view=calendar", {
      scroll: false,
    });
  });

  it("shows an empty month, not the no-tasks message, when nothing is due", async () => {
    mockedFetchAll.mockResolvedValue({
      tasks: [],
      counts: { all: 0, action: 0, waiting: 0, done: 0 },
    });

    await renderPage({ view: "calendar" });

    expect(screen.getByRole("heading", { name: "Oktober 2026" })).toBeInTheDocument();
    expect(screen.queryByText(MY_TASKS_EMPTY.all)).not.toBeInTheDocument();
  });

  it("offers no deadline order on the calendar: a month has none to turn over", async () => {
    await renderPage({ view: "calendar" });

    expect(screen.queryByRole("button", { name: /Urutkan deadline/ })).not.toBeInTheDocument();
  });

  it("shows the table for a view it does not know", async () => {
    await renderPage({ view: "grid" });

    expect(switchLink("Tabel")).toHaveAttribute("aria-current", "page");
    expect(mockedFetchAll).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Oktober 2026" })).not.toBeInTheDocument();
  });

  it("tells a visitor who is not signed in, on the calendar as on the table", async () => {
    mockedFetchAll.mockRejectedValue(new MyTasksError(401));

    await renderPage({ view: "calendar" });

    expect(screen.getByRole("alert")).toHaveTextContent("Kamu belum masuk sebagai creator.");
    expect(screen.queryByRole("heading", { name: "Oktober 2026" })).not.toBeInTheDocument();
  });

  it.each([
    ["a server error", new MyTasksError(500)],
    ["an unreachable backend", new TypeError("fetch failed")],
  ])("offers a reload of the calendar after %s on the calendar", async (_label, failure) => {
    mockedFetchAll.mockRejectedValue(failure);

    await renderPage({ view: "calendar", tab: "done" });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Daftar tugas tidak bisa dimuat.");
    expect(within(alert).getByRole("link", { name: "Muat ulang" })).toHaveAttribute(
      "href",
      "/creator/tasks?tab=done&view=calendar",
    );
    expect(screen.queryByRole("heading", { name: "Oktober 2026" })).not.toBeInTheDocument();
  });
});
