import { render, screen } from "@testing-library/react";
import type { AuditLogRow } from "@/lib/audit-log";
import { jakartaDay } from "@/lib/format";
import AuditLogPage, { metadata } from "./page";

const { load, panel } = vi.hoisted(() => ({ load: vi.fn(), panel: vi.fn() }));

vi.mock("@/lib/audit-log.server", () => ({
  loadAuditLog: (state: unknown) => load(state),
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
    load.mockResolvedValue(LOADED);
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
    expect(panel).toHaveBeenCalledWith(expect.objectContaining({ list: null, actors: [], creators: [] }));
  });
});
