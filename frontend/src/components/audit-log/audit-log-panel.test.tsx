import { act, render, screen, within } from "@testing-library/react";
import type { AuditLogList, AuditLogRow, AuditLogState } from "@/lib/audit-log";
import { AuditLogPanel } from "./audit-log-panel";

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: vi.fn(() => ({ pending: false })) };
});

vi.mock("./audit-log-filters", async () => {
  const { use } = await import("react");
  type Options = { actors: unknown[]; creators: unknown[] };
  return {
    AuditLogFilters: ({ today, actors }: { today: string; actors: unknown[] }) => (
      <div data-testid="filters" data-actors={actors.length}>
        {today}
      </div>
    ),
    AuditLogFiltersFrom: ({ today, options }: { today: string; options: Promise<Options> }) => (
      <div data-testid="filters" data-actors={use(options).actors.length}>
        {today}
      </div>
    ),
  };
});

const NO_FILTERS: AuditLogState = {
  page: 1,
  from: "",
  to: "",
  actor: [],
  category: [],
  action: [],
  creator: [],
};

const ROW: AuditLogRow = {
  id: "entry-1",
  occurredAt: "2026-11-15T02:12:00.000Z",
  actor: { name: "Rina Wijaya", role: "super_admin" },
  category: "pengaturan",
  action: "buffer_changed",
  targetType: "buffer",
  targetLabel: "Buffer Deadline",
  creator: null,
  oldValues: { days: 7 },
  newValues: { days: 5 },
  note: null,
};

function list(overrides: Partial<AuditLogList> = {}): AuditLogList {
  return { items: [ROW], page: 1, pageSize: 20, total: 1, totalPages: 1, ...overrides };
}

// Still loading unless a test says otherwise, so the bar shows with no choices yet.
function renderPanel(
  loaded: AuditLogList | null,
  state: AuditLogState = NO_FILTERS,
  options: Promise<{
    actors: { value: string; label: string }[];
    creators: { value: string; label: string }[];
  }> = new Promise(() => {}),
) {
  render(<AuditLogPanel state={state} list={loaded} options={options} today="2026-11-22" />);
}

describe("AuditLogPanel", () => {
  it("shows the rows and an empty filter bar while the choices load", () => {
    renderPanel(list());

    expect(screen.getByTestId("filters")).toHaveAttribute("data-actors", "0");
    expect(within(screen.getByRole("table", { name: "Log aktivitas" })).getByText("Rina Wijaya")).toBeInTheDocument();
  });

  it("fills the filter bar once the choices arrive", async () => {
    await act(async () => {
      renderPanel(
        list(),
        NO_FILTERS,
        Promise.resolve({ actors: [{ value: "system", label: "Sistem" }], creators: [] }),
      );
    });

    expect(screen.getByTestId("filters")).toHaveAttribute("data-actors", "1");
  });

  // The Sprint 4 prototype's words.
  it("heads the panel with what the log is", () => {
    renderPanel(list());

    expect(screen.getByRole("heading", { name: "Semua Aktivitas" })).toBeInTheDocument();
    expect(screen.getByText(/Hanya bisa ditambah, tidak bisa diubah atau dihapus\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentang Log Aktivitas" })).toBeInTheDocument();
  });

  it("shows the filters and the rows", () => {
    renderPanel(list());

    expect(screen.getByTestId("filters")).toHaveTextContent("2026-11-22");
    const table = screen.getByRole("table", { name: "Log aktivitas" });
    expect(within(table).getByText("Rina Wijaya")).toBeInTheDocument();
  });

  it("counts the rows even when they fit on one page", () => {
    renderPanel(list());

    expect(screen.getByText("Menampilkan 1–1 dari 1 aktivitas")).toBeInTheDocument();
  });

  it("names the slice on show and keeps the filters in the page links", () => {
    renderPanel(list({ page: 2, total: 45, totalPages: 3 }), {
      ...NO_FILTERS,
      page: 2,
      category: ["pengaturan"],
    });

    expect(screen.getByText("Menampilkan 21–40 dari 45 aktivitas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Berikutnya" })).toHaveAttribute(
      "href",
      "/admin/log-aktivitas?category=pengaturan&page=3",
    );
    expect(screen.getByRole("link", { name: "Sebelumnya" })).toHaveAttribute(
      "href",
      "/admin/log-aktivitas?category=pengaturan",
    );
  });

  it("says when nothing has been recorded yet", () => {
    renderPanel(list({ items: [], total: 0, totalPages: 0 }));

    expect(screen.getByText("Belum ada aktivitas.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Menampilkan 0 aktivitas")).toBeInTheDocument();
    expect(screen.getByText("Halaman 1 dari 1")).toBeInTheDocument();
  });

  it.each([
    ["a day", { from: "2026-11-01" }],
    ["the last day", { to: "2026-11-01" }],
    ["an actor", { actor: ["system"] }],
    ["a category", { category: ["pengaturan" as const] }],
    ["an action", { action: ["buffer_changed" as const] }],
    ["a creator", { creator: ["33333333-3333-4333-8333-333333333333"] }],
  ])("says when %s matches nothing", (_label, filter) => {
    renderPanel(list({ items: [], total: 0, totalPages: 0 }), { ...NO_FILTERS, ...filter });

    expect(screen.getByText("Tidak ada aktivitas yang cocok dengan filter.")).toBeInTheDocument();
    expect(screen.queryByText("Belum ada aktivitas.")).not.toBeInTheDocument();
  });

  // A request that failed is not a list that is empty.
  it("says the dates are reversed instead of an error or an empty log", () => {
    renderPanel(null, { ...NO_FILTERS, from: "2026-11-30", to: "2026-11-01" });

    expect(screen.getByText("Tanggal mulai tidak boleh setelah tanggal akhir.")).toBeInTheDocument();
    expect(screen.getByTestId("filters")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Menampilkan/)).not.toBeInTheDocument();
  });

  it("offers a retry on the same filters when the list cannot be loaded", () => {
    renderPanel(null, { ...NO_FILTERS, page: 2, category: ["pengaturan"] });

    expect(screen.getByRole("alert")).toHaveTextContent("Log Aktivitas tidak bisa dimuat.");
    expect(screen.getByRole("link", { name: "Muat ulang" })).toHaveAttribute(
      "href",
      "/admin/log-aktivitas?category=pengaturan&page=2",
    );
    expect(screen.queryByText("Belum ada aktivitas.")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Menampilkan/)).not.toBeInTheDocument();
  });

  it("retries at the bare address when nothing is filtered", () => {
    renderPanel(null);

    expect(screen.getByRole("link", { name: "Muat ulang" })).toHaveAttribute("href", "/admin/log-aktivitas");
  });
});
