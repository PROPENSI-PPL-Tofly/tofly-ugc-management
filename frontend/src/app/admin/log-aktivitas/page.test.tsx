import { render, screen } from "@testing-library/react";
import type { AuditLogRow } from "@/lib/audit-log";
import { jakartaDay } from "@/lib/format";
import AuditLogPage, { metadata } from "./page";

const { load, loadOptions, panel, session } = vi.hoisted(() => ({
  load: vi.fn(),
  loadOptions: vi.fn(),
  panel: vi.fn(),
  session: vi.fn(),
}));

vi.mock("@/lib/audit-log.server", () => ({
  loadAuditLogList: (state: unknown) => load(state),
  loadAuditLogFilterOptions: () => loadOptions(),
}));

vi.mock("@/lib/session.server", () => ({
  currentSession: () => session(),
}));

vi.mock("@/components/shell/app-shell", () => ({
  AppShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

vi.mock("@/components/audit-log/audit-log-panel", () => ({
  AuditLogPanel: (props: { list: { items: AuditLogRow[] } | null }) => {
    panel(props);
    return <div>{props.list ? "loaded" : "failed"}</div>;
  },
}));

const LOADED = {
  list: { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 },
  actors: [{ value: "system", label: "Sistem" }],
  creators: [{ value: "creator-1", label: "Salsa Amelia" }],
};

async function renderPage(params: Record<string, string> = {}) {
  render(await AuditLogPage({ searchParams: Promise.resolve(params) }));
}

describe("Log Aktivitas page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    load.mockResolvedValue(LOADED.list);
    loadOptions.mockResolvedValue({ actors: LOADED.actors, creators: LOADED.creators });
    session.mockResolvedValue({ role: "admin", isSuperAdmin: true });
  });

  // PBI-23 AC 3 (OWASP A01:2025): a typed address opens nothing for a regular Admin.
  it("tells a regular Admin the page is not theirs, loading no entry", async () => {
    session.mockResolvedValue({ role: "admin", isSuperAdmin: false });

    await renderPage();

    expect(screen.getByRole("heading", { name: "Akses ditolak" })).toBeInTheDocument();
    expect(screen.getByText("Halaman ini hanya untuk Super Admin.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kembali ke Kreator" })).toHaveAttribute(
      "href",
      "/admin/creators",
    );
    expect(load).not.toHaveBeenCalled();
    expect(loadOptions).not.toHaveBeenCalled();
    expect(panel).not.toHaveBeenCalled();
  });

  it("names the page", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Log Aktivitas" })).toBeInTheDocument();
    expect(metadata.title).toBe("Log Aktivitas — Tofly");
  });

  it("loads the list for the filters in the address, checked", async () => {
    await renderPage({ category: "pengaturan,secret", page: "2" });

    expect(load).toHaveBeenCalledWith(expect.objectContaining({ category: ["pengaturan"], page: 2 }));
  });

  it("hands the panel the list, its filter choices and Jakarta's day", async () => {
    await renderPage();

    expect(panel).toHaveBeenCalledWith(
      expect.objectContaining({
        list: LOADED.list,
        actors: LOADED.actors,
        creators: LOADED.creators,
        today: jakartaDay(),
      }),
    );
  });

  // A request that failed is not a log that is empty.
  it("tells the panel when the list could not be loaded", async () => {
    load.mockRejectedValue(new Error("down"));

    await renderPage();

    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(panel).toHaveBeenCalledWith(
      expect.objectContaining({ list: null, actors: LOADED.actors, creators: LOADED.creators }),
    );
  });

  // The entries are the page's purpose: losing the filter choices must not hide them.
  it("still shows the list when only the filter choices fail", async () => {
    loadOptions.mockRejectedValue(new Error("down"));

    await renderPage();

    expect(screen.getByText("loaded")).toBeInTheDocument();
    expect(panel).toHaveBeenCalledWith(
      expect.objectContaining({ list: LOADED.list, actors: [], creators: [] }),
    );
  });
});
