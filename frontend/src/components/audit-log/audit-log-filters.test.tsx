import { fireEvent, render, screen } from "@testing-library/react";
import { AuditLogFilters } from "./audit-log-filters";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const CREATOR_ID = "33333333-3333-4333-8333-333333333333";

const ACTORS = [
  { value: ADMIN_ID, label: "Rina Wijaya" },
  { value: "system", label: "Sistem" },
];
const CREATORS = [{ value: CREATOR_ID, label: "Salsa Amelia" }];

const hook = vi.hoisted(() => ({
  values: {} as Record<string, string>,
  current: {
    search: "",
    setSearch: vi.fn<(value: string) => void>(),
    param: vi.fn<(key: string) => string>(),
    listParam: vi.fn<(key: string) => string>(),
    setParam: vi.fn<(key: string, value: string) => void>(),
    setParams: vi.fn<(changes: Record<string, string>) => void>(),
    setPeriod: vi.fn<(period: string) => void>(),
    reset: vi.fn(),
    resetKeeping: vi.fn<(keep: Record<string, string>) => void>(),
    pending: false,
  },
}));

vi.mock("@/lib/use-url-filters", () => ({
  useUrlFilters: () => hook.current,
  SEARCH_DEBOUNCE_MS: 300,
  MAX_SEARCH_LENGTH: 100,
}));

function renderBar(values: Record<string, string> = {}) {
  hook.values = values;
  render(<AuditLogFilters actors={ACTORS} creators={CREATORS} today="2026-11-22" />);
}

function openPill(label: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));
}

function offered() {
  return screen.getAllByRole("checkbox").map((box) => box.closest("label")?.textContent);
}

describe("AuditLogFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hook.values = {};
    hook.current.pending = false;
    hook.current.param.mockImplementation((key) => hook.values[key] ?? "all");
    hook.current.listParam.mockImplementation((key) => hook.values[key] ?? "all");
  });

  // The Sprint 4 prototype's filters, with the category before the action it narrows (SCRUM-297).
  it("offers the filters in the prototype's order", () => {
    renderBar();

    const names = screen
      .getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .filter((text) => /^(Aktor|Kategori|Aksi|Creator)/.test(text))
      .map((text) => text.match(/^(Aktor|Kategori|Aksi|Creator)/)?.[0]);
    expect(names).toEqual(["Aktor", "Kategori", "Aksi", "Creator"]);
    expect(screen.getByLabelText("Dari tanggal")).toBeInTheDocument();
    expect(screen.getByLabelText("Sampai tanggal")).toBeInTheDocument();
  });

  it("stops both days at today", () => {
    renderBar();

    expect(screen.getByLabelText("Dari tanggal")).toHaveAttribute("max", "2026-11-22");
    expect(screen.getByLabelText("Sampai tanggal")).toHaveAttribute("max", "2026-11-22");
  });

  it("keeps each day on its side of the other", () => {
    renderBar({ from: "2026-11-01", to: "2026-11-10" });

    expect(screen.getByLabelText("Dari tanggal")).toHaveAttribute("max", "2026-11-10");
    expect(screen.getByLabelText("Sampai tanggal")).toHaveAttribute("min", "2026-11-01");
  });

  it.each([
    ["Dari tanggal", "from"],
    ["Sampai tanggal", "to"],
  ])("writes %s to the address", (label, key) => {
    renderBar();

    fireEvent.change(screen.getByLabelText(label), { target: { value: "2026-11-05" } });

    expect(hook.current.setParam).toHaveBeenCalledWith(key, "2026-11-05");
  });

  it("offers the actors it is given, Sistem among them", () => {
    renderBar();

    openPill("Aktor");

    expect(offered()).toEqual(["Rina Wijaya", "Sistem"]);
  });

  it("writes a picked actor to the address", () => {
    renderBar();

    openPill("Aktor");
    fireEvent.click(screen.getByRole("checkbox", { name: "Sistem" }));

    expect(hook.current.setParam).toHaveBeenCalledWith("actor", "system");
  });

  it("offers the four categories", () => {
    renderBar();

    openPill("Kategori");

    expect(offered()).toEqual(["Akses Admin", "Creator & Kontrak", "Invoice & Pembayaran", "Pengaturan"]);
  });

  it("narrows the actions by the picked category", () => {
    renderBar({ category: "pengaturan" });

    openPill("Aksi");

    expect(offered()).toEqual(["Ubah Formula Rate", "Ubah Buffer Deadline"]);
  });

  it("offers every action while no category is picked", () => {
    renderBar();

    openPill("Aksi");

    expect(offered()).toHaveLength(19);
  });

  // One navigation, so no address with a hidden action on it is ever opened.
  it("drops a picked action the new category does not hold, in the same change", () => {
    renderBar({ action: "admin_added,buffer_changed" });

    openPill("Kategori");
    fireEvent.click(screen.getByRole("checkbox", { name: "Pengaturan" }));

    expect(hook.current.setParams).toHaveBeenCalledWith({
      category: "pengaturan",
      action: "buffer_changed",
    });
  });

  it("writes a picked action to the address", () => {
    renderBar({ category: "pengaturan" });

    openPill("Aksi");
    fireEvent.click(screen.getByRole("checkbox", { name: "Ubah Buffer Deadline" }));

    expect(hook.current.setParam).toHaveBeenCalledWith("action", "buffer_changed");
  });

  it("writes a picked creator to the address", () => {
    renderBar();

    openPill("Creator");
    fireEvent.click(screen.getByRole("checkbox", { name: "Salsa Amelia" }));

    expect(hook.current.setParam).toHaveBeenCalledWith("creator", CREATOR_ID);
  });

  it("names every filter in use as a chip", () => {
    renderBar({
      from: "2026-11-01",
      to: "2026-11-10",
      actor: "system",
      category: "pengaturan",
      action: "buffer_changed",
      creator: CREATOR_ID,
    });

    for (const value of ["1 Nov 2026", "10 Nov 2026", "Pengaturan", "Ubah Buffer Deadline", "Salsa Amelia"]) {
      expect(screen.getAllByText(value, { exact: false }).length).toBeGreaterThan(0);
    }
  });

  it("offers no reset while nothing is filtered", () => {
    renderBar();

    expect(screen.queryByRole("button", { name: /^Reset/ })).not.toBeInTheDocument();
  });

  it("clears every filter at once", () => {
    renderBar({ category: "pengaturan" });

    fireEvent.click(screen.getByRole("button", { name: /^Reset/ }));

    expect(hook.current.reset).toHaveBeenCalledOnce();
  });
});
