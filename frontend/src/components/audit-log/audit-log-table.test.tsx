import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AuditLogRow } from "@/lib/audit-log";
import { EMPTY } from "@/lib/format";
import { AuditLogTable } from "./audit-log-table";

function entry(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
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
    ...overrides,
  };
}

function cellsOf(row = 1) {
  return within(screen.getAllByRole("row")[row]).getAllByRole("cell");
}

describe("AuditLogTable", () => {
  // The Sprint 4 prototype's columns, in its order.
  it("shows the six columns of Log Aktivitas", () => {
    render(<AuditLogTable rows={[entry()]} />);

    expect(screen.getAllByRole("columnheader").map((head) => head.textContent)).toEqual([
      "Waktu",
      "Aktor",
      "Kategori",
      "Aksi",
      "Target",
      "Perubahan",
    ]);
  });

  it("names the table for a screen reader", () => {
    render(<AuditLogTable rows={[entry()]} />);

    expect(screen.getByRole("table", { name: "Log aktivitas" })).toBeInTheDocument();
  });

  it("fills a row with the time in WIB, category, action and target", () => {
    render(<AuditLogTable rows={[entry()]} />);

    const [time, , category, action, target] = cellsOf();
    expect(time).toHaveTextContent("15 Nov 2026, 09.12 WIB");
    expect(category).toHaveTextContent("Pengaturan");
    expect(action).toHaveTextContent("Ubah Buffer Deadline");
    expect(target).toHaveTextContent("Buffer Deadline");
  });

  // PBI-23 AC 16.
  it("links a target to where it lives", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    render(
      <AuditLogTable
        rows={[entry({ targetType: "contract", targetLabel: "Salsa Amelia", creator: { id, name: "Salsa Amelia" } })]}
      />,
    );

    expect(within(cellsOf()[4]).getByRole("link", { name: "Salsa Amelia" })).toHaveAttribute(
      "href",
      `/admin/creators/${id}`,
    );
  });

  it("shows a target with nowhere to go as plain text", () => {
    render(<AuditLogTable rows={[entry()]} />);

    expect(within(cellsOf()[4]).queryByRole("link")).not.toBeInTheDocument();
    expect(cellsOf()[4]).toHaveTextContent("Buffer Deadline");
  });

  it("labels each cell for the phone layout", () => {
    render(<AuditLogTable rows={[entry()]} />);

    expect(cellsOf().map((cell) => cell.getAttribute("data-label"))).toEqual([
      "Waktu",
      "Aktor",
      "Kategori",
      "Aksi",
      "Target",
      "Perubahan",
    ]);
  });

  it("puts the actor's name over their role", () => {
    render(<AuditLogTable rows={[entry()]} />);

    const actor = cellsOf()[1];
    expect(within(actor).getByText("Rina Wijaya")).toBeInTheDocument();
    expect(within(actor).getByText("Super Admin")).toBeInTheDocument();
  });

  it("shows Sistem with no role", () => {
    render(<AuditLogTable rows={[entry({ actor: { name: "Sistem", role: "system" } })]} />);

    expect(cellsOf()[1].textContent).toBe("Sistem");
  });

  it.each([
    ["akses_admin", "admin_added", "bg-accent-wash"],
    ["creator_kontrak", "creator_added", "bg-surface-2"],
    ["invoice_pembayaran", "invoice_finalized", "bg-amber-wash"],
    ["pengaturan", "buffer_changed", "bg-green-wash"],
  ] as const)("gives %s the prototype's colour", (category, action, tone) => {
    render(<AuditLogTable rows={[entry({ category, action })]} />);

    expect(cellsOf()[2].querySelector("span")).toHaveClass(tone);
  });

  it("shows one changed field on the row as old and new", () => {
    render(<AuditLogTable rows={[entry()]} />);

    expect(cellsOf()[5]).toHaveTextContent("days: 7 → 5");
    expect(screen.queryByRole("button", { name: /perubahan/i })).not.toBeInTheDocument();
  });

  it("names and formats a single change", () => {
    render(<AuditLogTable rows={[entry({ oldValues: null, newValues: { total: 4500000 } })]} />);

    expect(cellsOf()[5]).toHaveTextContent(`Total: ${EMPTY} → Rp4.500.000`);
  });

  it("shows the dash for an entry without a change", () => {
    render(<AuditLogTable rows={[entry({ oldValues: null, newValues: null })]} />);

    expect(cellsOf()[5].textContent).toBe(EMPTY);
  });

  // SCRUM-297: old and new values expand from the row.
  it("keeps several changed fields closed until the row is expanded", () => {
    render(
      <AuditLogTable
        rows={[entry({ oldValues: { name: "Lama", role: "admin" }, newValues: { name: "Baru", role: "super_admin" } })]}
      />,
    );

    const toggle = screen.getByRole("button", { name: "2 perubahan" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Lama/)).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(cellsOf()[5]).toHaveTextContent("Nama: Lama → Baru");
    expect(cellsOf()[5]).toHaveTextContent("role: admin → super_admin");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Lama/)).not.toBeInTheDocument();
  });

  it("expands one row without opening another", () => {
    const several = { oldValues: { a: 1, b: 2 }, newValues: { a: 3, b: 4 } };
    render(<AuditLogTable rows={[entry({ id: "one", ...several }), entry({ id: "two", ...several })]} />);

    const [first, second] = screen.getAllByRole("button", { name: "2 perubahan" });
    fireEvent.click(first);

    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "false");
  });

  it("offers the entry's note when it has one", () => {
    render(<AuditLogTable rows={[entry({ note: "Bonus kolaborasi" })]} />);

    expect(within(cellsOf()[5]).getByRole("button", { name: "Catatan" })).toBeInTheDocument();
  });

  it("offers no note when the entry has none", () => {
    render(<AuditLogTable rows={[entry()]} />);

    expect(screen.queryByRole("button", { name: "Catatan" })).not.toBeInTheDocument();
  });
});
