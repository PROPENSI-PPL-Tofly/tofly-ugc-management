import type { AuditLogState } from "./audit-log";
import { mockAuditLog } from "./audit-log-mock";

const NO_FILTERS: AuditLogState = {
  page: 1,
  from: "",
  to: "",
  actor: [],
  category: [],
  action: [],
  creator: [],
};

function all(state: Partial<AuditLogState> = {}) {
  const first = mockAuditLog({ ...NO_FILTERS, ...state, page: 1 });
  const pages = Array.from({ length: Math.max(1, first.list.totalPages) }, (_, index) =>
    mockAuditLog({ ...NO_FILTERS, ...state, page: index + 1 }).list.items,
  );
  return pages.flat();
}

describe("mockAuditLog", () => {
  it("answers 20 rows a page, with enough rows to page through", () => {
    const { list } = mockAuditLog(NO_FILTERS);

    expect(list.items).toHaveLength(20);
    expect(list.pageSize).toBe(20);
    expect(list.total).toBeGreaterThan(20);
    expect(list.totalPages).toBe(Math.ceil(list.total / 20));
  });

  it("answers the newest first", () => {
    const times = all().map((row) => row.occurredAt);

    expect(times).toEqual([...times].sort().reverse());
  });

  it("gives every row its own id", () => {
    const ids = all().map((row) => row.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("answers the next slice on the next page", () => {
    const first = mockAuditLog(NO_FILTERS).list.items;
    const second = mockAuditLog({ ...NO_FILTERS, page: 2 }).list;

    expect(second.page).toBe(2);
    expect(second.items[0].id).not.toBe(first[0].id);
  });

  it("answers the last page for a page past the end", () => {
    const { list } = mockAuditLog({ ...NO_FILTERS, page: 999 });

    expect(list.page).toBe(list.totalPages);
    expect(list.items.length).toBeGreaterThan(0);
  });

  it("narrows by category", () => {
    const rows = all({ category: ["akses_admin"] });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.category === "akses_admin")).toBe(true);
  });

  it("narrows by action", () => {
    const rows = all({ action: ["buffer_changed"] });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.action === "buffer_changed")).toBe(true);
  });

  it("offers Sistem among the actors and narrows to it", () => {
    const { actors } = mockAuditLog(NO_FILTERS);
    expect(actors).toContainEqual({ value: "system", label: "Sistem" });

    const rows = all({ actor: ["system"] });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.actor.role === "system")).toBe(true);
  });

  it("narrows by a person among the actors", () => {
    const { actors } = mockAuditLog(NO_FILTERS);
    const person = actors.find((actor) => actor.value !== "system");

    const rows = all({ actor: [person!.value] });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.actor.name === person!.label)).toBe(true);
  });

  it("narrows by creator", () => {
    const { creators } = mockAuditLog(NO_FILTERS);

    const rows = all({ creator: [creators[0].value] });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.creator?.id === creators[0].value)).toBe(true);
  });

  // 16:40 on 14 Nov in Jakarta is the prototype's Finalize; 00:05 WIB is still 13 Nov in UTC.
  it("reads the date range on Jakarta's calendar", () => {
    const rows = all({ from: "2026-11-14", to: "2026-11-14" });

    expect(rows.map((row) => row.action).sort()).toEqual(["creator_changed", "invoice_finalized"].sort());
  });

  it("answers an empty list when nothing matches", () => {
    const { list } = mockAuditLog({ ...NO_FILTERS, from: "2020-01-01", to: "2020-01-02" });

    expect(list).toMatchObject({ items: [], total: 0, totalPages: 0, page: 1 });
  });
});
