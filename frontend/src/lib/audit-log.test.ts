import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS_BY_CATEGORY,
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_LABELS,
  AUDIT_LOG_PAGE_SIZE,
  actionsInCategories,
  auditActionLabel,
  auditActorLines,
  auditChangeShown,
  auditChangeView,
  auditChanges,
  auditDatesReversed,
  auditTargetHref,
  auditTimeLabel,
  buildAuditLogQuery,
  keepActionsInCategories,
  parseAuditLogParams,
} from "./audit-log";
import { EMPTY, formatDate } from "./format";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const CREATOR_ID = "33333333-3333-4333-8333-333333333333";

const NO_FILTERS = {
  page: 1,
  from: "",
  to: "",
  actor: [],
  category: [],
  action: [],
  creator: [],
};

describe("audit log categories", () => {
  // PBI-23 AC 15: the four categories, in its order and words.
  it("lists the four categories of Log Aktivitas with their labels", () => {
    expect(AUDIT_CATEGORIES.map((category) => AUDIT_CATEGORY_LABELS[category])).toEqual([
      "Akses Admin",
      "Creator & Kontrak",
      "Invoice & Pembayaran",
      "Pengaturan",
    ]);
  });

  // The same keys the backend stores (SCRUM-295), so a filter value reaches the API unchanged.
  it("files the 19 actions under their category", () => {
    expect(AUDIT_ACTIONS_BY_CATEGORY).toEqual({
      akses_admin: ["admin_added", "admin_changed", "admin_deactivated", "admin_reactivated"],
      creator_kontrak: [
        "creator_added",
        "creator_changed",
        "contract_extended",
        "period_changed",
        "period_deleted",
        "contract_ended_early",
        "manual_performance_saved",
      ],
      invoice_pembayaran: [
        "invoice_finalized",
        "invoice_line_corrected",
        "invoice_acknowledged",
        "payment_proof_uploaded",
        "payment_confirmed",
        "invoice_cancelled",
      ],
      pengaturan: ["rate_formula_changed", "buffer_changed"],
    });
    expect(Object.values(AUDIT_ACTIONS_BY_CATEGORY).flat()).toHaveLength(19);
  });
});

describe("actionsInCategories", () => {
  it("offers every action while no category is picked", () => {
    expect(actionsInCategories([])).toHaveLength(19);
  });

  // PBI-23 AC 17: the action filter is narrowed by the chosen category.
  it("offers only the actions of the picked category", () => {
    expect(actionsInCategories(["pengaturan"])).toEqual(["rate_formula_changed", "buffer_changed"]);
  });

  it("offers the actions of several picked categories, in the categories' order", () => {
    expect(actionsInCategories(["pengaturan", "akses_admin"])).toEqual([
      "admin_added",
      "admin_changed",
      "admin_deactivated",
      "admin_reactivated",
      "rate_formula_changed",
      "buffer_changed",
    ]);
  });
});

describe("keepActionsInCategories", () => {
  it("keeps every picked action while no category is picked", () => {
    expect(keepActionsInCategories(["admin_added", "buffer_changed"], [])).toEqual([
      "admin_added",
      "buffer_changed",
    ]);
  });

  it("drops a picked action that the new category does not hold", () => {
    expect(keepActionsInCategories(["admin_added", "buffer_changed"], ["pengaturan"])).toEqual([
      "buffer_changed",
    ]);
  });

  it("leaves nothing when none of the picked actions fit", () => {
    expect(keepActionsInCategories(["admin_added"], ["pengaturan"])).toEqual([]);
  });
});

describe("parseAuditLogParams", () => {
  // PBI-23 AC 17.
  it("shows 20 rows per page", () => {
    expect(AUDIT_LOG_PAGE_SIZE).toBe(20);
  });

  it("reads a bare address as no filters on the first page", () => {
    expect(parseAuditLogParams({})).toEqual(NO_FILTERS);
  });

  it("reads every filter from the address", () => {
    expect(
      parseAuditLogParams({
        page: "3",
        from: "2026-11-01",
        to: "2026-11-30",
        actor: `${ADMIN_ID},system`,
        category: "pengaturan",
        action: "buffer_changed",
        creator: CREATOR_ID,
      }),
    ).toEqual({
      page: 3,
      from: "2026-11-01",
      to: "2026-11-30",
      actor: [ADMIN_ID, "system"],
      category: ["pengaturan"],
      action: ["buffer_changed"],
      creator: [CREATOR_ID],
    });
  });

  it("reads a one-day range", () => {
    expect(parseAuditLogParams({ from: "2026-11-21", to: "2026-11-21" })).toMatchObject({
      from: "2026-11-21",
      to: "2026-11-21",
    });
  });

  it.each(["2026-02-31", "21-11-2026", "yesterday", "2026-11-21' OR '1'='1"])(
    "ignores a date that is not a real day: %s",
    (day) => {
      expect(parseAuditLogParams({ from: day, to: day })).toEqual(NO_FILTERS);
    },
  );

  // Dropping the dates would silently show more entries than were asked for.
  it("keeps a range that ends before it starts, and names it reversed", () => {
    const state = parseAuditLogParams({ from: "2026-11-30", to: "2026-11-01" });

    expect(state).toMatchObject({ from: "2026-11-30", to: "2026-11-01" });
    expect(auditDatesReversed(state)).toBe(true);
  });

  it.each([
    ["2026-11-01", "2026-11-30"],
    ["2026-11-21", "2026-11-21"],
    ["2026-11-21", ""],
    ["", "2026-11-21"],
    ["", ""],
  ])("does not call %s to %s reversed", (from, to) => {
    expect(auditDatesReversed(parseAuditLogParams({ from, to }))).toBe(false);
  });

  // The API refuses more than 50 values, and a retry on that address would fail the same way.
  it("keeps at most 50 values per filter", () => {
    const ids = Array.from(
      { length: 51 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );

    const state = parseAuditLogParams({ actor: ids.join(","), creator: ids.join(",") });

    expect(state.actor).toEqual(ids.slice(0, 50));
    expect(state.creator).toEqual(ids.slice(0, 50));
  });

  // OWASP A05:2025: only values the page checked can reach the API.
  it("keeps only real ids for the actor and creator, and Sistem for the actor alone", () => {
    expect(
      parseAuditLogParams({
        actor: `${ADMIN_ID},../auth,1 OR 1=1`,
        creator: `system,${CREATOR_ID},abc`,
      }),
    ).toMatchObject({ actor: [ADMIN_ID], creator: [CREATOR_ID] });
  });

  it("ignores a category or action the log does not have", () => {
    expect(parseAuditLogParams({ category: "secret", action: "drop_table" })).toEqual(NO_FILTERS);
  });

  it("drops an action outside the picked category", () => {
    expect(
      parseAuditLogParams({
        category: "pengaturan",
        action: "admin_added,buffer_changed",
      }).action,
    ).toEqual(["buffer_changed"]);
  });

  it("counts a value repeated in the address once", () => {
    expect(
      parseAuditLogParams({
        actor: [ADMIN_ID, ADMIN_ID],
        category: "pengaturan,pengaturan",
        action: "buffer_changed,buffer_changed",
        creator: `${CREATOR_ID},${CREATOR_ID}`,
      }),
    ).toMatchObject({
      actor: [ADMIN_ID],
      category: ["pengaturan"],
      action: ["buffer_changed"],
      creator: [CREATOR_ID],
    });
  });

  it.each(["0", "-1", "1.5", "abc", "9007199254740992", "1000000000000000000000"])("reads a page of %s as the first", (page) => {
    expect(parseAuditLogParams({ page }).page).toBe(1);
  });
});

describe("buildAuditLogQuery", () => {
  it("leaves the defaults out, so the bare list stays at the bare address", () => {
    expect(buildAuditLogQuery(NO_FILTERS)).toEqual({});
  });

  it("writes every filter in a stable order, each list comma-separated", () => {
    const query = buildAuditLogQuery({
      page: 2,
      from: "2026-11-01",
      to: "2026-11-30",
      actor: [ADMIN_ID, OTHER_ADMIN_ID],
      category: ["akses_admin", "pengaturan"],
      action: ["admin_added", "buffer_changed"],
      creator: [CREATOR_ID],
    });

    expect(Object.entries(query)).toEqual([
      ["from", "2026-11-01"],
      ["to", "2026-11-30"],
      ["actor", `${ADMIN_ID},${OTHER_ADMIN_ID}`],
      ["category", "akses_admin,pengaturan"],
      ["action", "admin_added,buffer_changed"],
      ["creator", CREATOR_ID],
      ["page", "2"],
    ]);
  });

  it("leaves the first page out", () => {
    expect(buildAuditLogQuery({ ...NO_FILTERS, page: 1, from: "2026-11-01" })).toEqual({
      from: "2026-11-01",
    });
  });

  it("reads back as the same state", () => {
    const state = {
      page: 4,
      from: "2026-11-01",
      to: "2026-11-30",
      actor: [ADMIN_ID, "system"],
      category: ["creator_kontrak" as const],
      action: ["period_deleted" as const],
      creator: [CREATOR_ID],
    };

    expect(parseAuditLogParams(buildAuditLogQuery(state))).toEqual(state);
  });
});

describe("auditActionLabel", () => {
  // The Sprint 4 prototype's words for the actions it names one to one.
  it.each([
    ["admin_added", "Tambah Admin"],
    ["admin_deactivated", "Nonaktifkan Admin"],
    ["admin_reactivated", "Aktifkan Admin"],
    ["creator_added", "Tambah Creator"],
    ["creator_changed", "Ubah Data Creator"],
    ["contract_extended", "Perpanjang Kontrak"],
    ["period_changed", "Ubah Periode"],
    ["period_deleted", "Hapus Periode"],
    ["contract_ended_early", "Akhiri Kontrak Lebih Awal"],
    ["manual_performance_saved", "Isi Angka Manual"],
    ["invoice_finalized", "Finalize Invoice"],
    ["payment_proof_uploaded", "Upload Bukti Bayar"],
    ["invoice_cancelled", "Batalkan Invoice"],
    ["rate_formula_changed", "Ubah Formula Rate"],
    ["buffer_changed", "Ubah Buffer Deadline"],
    ["admin_changed", "Ubah Admin"],
    ["invoice_line_corrected", "Koreksi Invoice"],
    ["invoice_acknowledged", "Konfirmasi Invoice"],
    ["payment_confirmed", "Konfirmasi Pembayaran"],
  ] as const)("names %s", (action, label) => {
    expect(auditActionLabel(action)).toBe(label);
  });

  it("has a label for every action", () => {
    for (const action of actionsInCategories([])) {
      expect(auditActionLabel(action)).not.toBe(action);
    }
  });
});

describe("auditTargetHref", () => {
  const creator = { id: CREATOR_ID, name: "Salsa Amelia" };

  // PBI-23 AC 16: the target links to where it lives.
  it.each(["creator", "contract", "content_link"] as const)("opens Creator Detail for a %s", (targetType) => {
    expect(auditTargetHref({ targetType, creator })).toBe(`/admin/creators/${CREATOR_ID}`);
  });

  // Rincian Invoice has no address of its own, so the list opens on that creator.
  it("opens Rate & Invoicing on the creator for an invoice", () => {
    expect(auditTargetHref({ targetType: "invoice", creator })).toBe("/admin/invoicing?q=Salsa+Amelia");
  });

  it("escapes the creator's name in the address", () => {
    expect(auditTargetHref({ targetType: "invoice", creator: { id: CREATOR_ID, name: "A&B=C" } })).toBe(
      "/admin/invoicing?q=A%26B%3DC",
    );
  });

  it.each(["admin", "rate_formula", "buffer"] as const)("has no link for a %s", (targetType) => {
    expect(auditTargetHref({ targetType, creator: null })).toBeNull();
  });

  it.each(["admin", "rate_formula", "buffer"] as const)(
    "has no link for a %s even when the entry names a creator",
    (targetType) => {
      expect(auditTargetHref({ targetType, creator })).toBeNull();
    },
  );

  // Entries outlive their targets (SCRUM-295), so a creator that is gone must not become a 404.
  it.each(["creator", "contract", "content_link", "invoice"] as const)(
    "has no link for a %s whose creator is gone",
    (targetType) => {
      expect(auditTargetHref({ targetType, creator: null })).toBeNull();
    },
  );

  // OWASP A05:2025: only a real id reaches a path.
  it("has no link for a creator id that is not a real id", () => {
    expect(auditTargetHref({ targetType: "creator", creator: { id: "../auth", name: "X" } })).toBeNull();
  });
});

describe("auditActorLines", () => {
  it.each([
    ["super_admin", "Super Admin"],
    ["admin", "Admin"],
    ["creator", "Creator"],
  ] as const)("puts a person's name over their role: %s", (role, label) => {
    expect(auditActorLines({ name: "Sinta", role })).toEqual({ name: "Sinta", role: label });
  });

  it("shows Sistem with no role for an entry no person made", () => {
    expect(auditActorLines({ name: "Sistem", role: "system" })).toEqual({
      name: "Sistem",
      role: null,
    });
  });
});

describe("auditChangeView", () => {
  it("has nothing to show for an entry without a change", () => {
    expect(auditChangeView(null, null)).toEqual({ kind: "none" });
  });

  it("shows one changed field on the row, as old and new", () => {
    expect(auditChangeView({ days: 7 }, { days: 5 })).toEqual({
      kind: "single",
      change: { field: "days", from: "7", to: "5" },
    });
  });

  // SCRUM-297: several changed fields open from the row.
  it("offers several changed fields to expand", () => {
    expect(auditChangeView({ a: 1, b: 2, c: 3 }, { a: 9, b: 8, c: 3 })).toEqual({
      kind: "expandable",
      changes: [
        { field: "a", from: "1", to: "9" },
        { field: "b", from: "2", to: "8" },
      ],
    });
  });
});

describe("auditChangeShown", () => {
  const shown = (field: string, from: string, to: string) => auditChangeShown({ field, from, to });

  // The backend stores real values; the row reads them in the app's words.
  it.each([
    ["status", "payment_uploaded", "paid", "Status", "Bukti Bayar Terkirim", "Paid"],
    ["status", "running", "finalized", "Status", "Berjalan", "Invoice Terkirim"],
    ["total", EMPTY, "4500000", "Total", EMPTY, "Rp4.500.000"],
    ["fixedRate", "500000", "750000", "Fixed Rate", "Rp500.000", "Rp750.000"],
    ["specificBonus", "0", "25000", "Bonus Spesifik", "Rp0", "Rp25.000"],
    ["latePenaltyPerDay", "1000", "2000", "Denda per Hari", "Rp1.000", "Rp2.000"],
    ["maxPenaltyDays", "3", "5", "Maks. Hari Denda", "3", "5"],
    ["views", "1200", "25000", "Views", "1.200", "25.000"],
    ["likes", "100", "200", "Likes", "100", "200"],
    ["comments", "1", "2", "Komentar", "1", "2"],
    ["shares", "1", "2", "Shares", "1", "2"],
    ["quota", "4", "6", "Kuota", "4", "6"],
    ["interval", "7", "14", "Interval (hari)", "7", "14"],
    ["contractType", "a", "b", "Tipe Kontrak", "a", "b"],
    ["platform", "tiktok", "instagram", "Platform", "tiktok", "instagram"],
    ["fileName", EMPTY, "bukti.pdf", "Nama File", EMPTY, "bukti.pdf"],
    ["name", "Lama", "Baru", "Nama", "Lama", "Baru"],
    ["email", "a@x.id", "b@x.id", "Email", "a@x.id", "b@x.id"],
    ["socialAccounts", "[1]", "[2]", "Akun Sosial", "[1]", "[2]"],
    ["contract", "{}", '{"a":1}', "Kontrak", "{}", '{"a":1}'],
    ["performanceBonus", "{}", '{"a":1}', "Bonus Performa", "{}", '{"a":1}'],
  ])("reads %s from %s to %s", (field, from, to, label, shownFrom, shownTo) => {
    expect(shown(field, from, to)).toEqual({ label, from: shownFrom, to: shownTo });
  });

  it.each(["startDate", "endDate"])("reads %s as a date", (field) => {
    expect(shown(field, "2026-11-01", "2026-11-30")).toEqual({
      label: field === "startDate" ? "Tanggal Mulai" : "Tanggal Selesai",
      from: formatDate("2026-11-01"),
      to: formatDate("2026-11-30"),
    });
  });

  // An audit record never hides what was stored.
  it("keeps a value it cannot read as it was stored", () => {
    expect(shown("total", "n/a", "4500000").from).toBe("n/a");
    expect(shown("views", "n/a", "1200").from).toBe("n/a");
    expect(shown("startDate", "soon", "2026-11-30").from).toBe("soon");
    expect(shown("status", "archived", "paid").from).toBe("archived");
  });

  it("keeps a field it does not know under its own name", () => {
    expect(shown("days", "7", "5")).toEqual({ label: "days", from: "7", to: "5" });
  });
});

describe("auditTimeLabel", () => {
  it("shows the moment in WIB", () => {
    expect(auditTimeLabel("2026-11-21T03:00:00.000Z")).toBe("21 Nov 2026, 10.00 WIB");
  });

  // 18.30 UTC is already the next day in Jakarta.
  it("uses Jakarta's day, not UTC's", () => {
    expect(auditTimeLabel("2026-11-20T18:30:00.000Z")).toBe("21 Nov 2026, 01.30 WIB");
  });

  it("shows the dash for a moment that cannot be read", () => {
    expect(auditTimeLabel("not-a-date")).toBe(EMPTY);
  });
});

describe("auditChanges", () => {
  it("lists only the fields that changed", () => {
    expect(auditChanges({ buffer: 3, name: "A" }, { buffer: 5, name: "A" })).toEqual([
      { field: "buffer", from: "3", to: "5" },
    ]);
  });

  it("shows the dash for a field that had no value before", () => {
    expect(auditChanges({}, { note: "baru" })).toEqual([
      { field: "note", from: EMPTY, to: "baru" },
    ]);
  });

  it("shows the dash for a field that no longer has a value", () => {
    expect(auditChanges({ note: "lama" }, { note: null })).toEqual([
      { field: "note", from: "lama", to: EMPTY },
    ]);
  });

  it("shows the dash for an empty string", () => {
    expect(auditChanges({ note: "" }, { note: "isi" })).toEqual([
      { field: "note", from: EMPTY, to: "isi" },
    ]);
  });

  it("keeps false and 0 as real values", () => {
    expect(auditChanges({ active: true, days: 1 }, { active: false, days: 0 })).toEqual([
      { field: "active", from: "true", to: "false" },
      { field: "days", from: "1", to: "0" },
    ]);
  });

  it("lists every field of an entry with only new values", () => {
    expect(auditChanges(null, { name: "Sinta" })).toEqual([
      { field: "name", from: EMPTY, to: "Sinta" },
    ]);
  });

  it("lists every field of an entry with only old values", () => {
    expect(auditChanges({ name: "Sinta" }, null)).toEqual([
      { field: "name", from: "Sinta", to: EMPTY },
    ]);
  });

  it("lists nothing for an entry without values", () => {
    expect(auditChanges(null, null)).toEqual([]);
  });

  // jsonb does not keep key order, so a reordered object is not a change.
  it("does not count a nested object with its keys reordered as a change", () => {
    expect(auditChanges({ tier: { a: 1, b: 2 } }, { tier: { b: 2, a: 1 } })).toEqual([]);
  });

  it("compares the objects inside a list regardless of their key order", () => {
    expect(auditChanges({ tiers: [{ a: 1, b: 2 }] }, { tiers: [{ b: 2, a: 1 }] })).toEqual([]);
  });

  it("shows a nested value that changed as text", () => {
    expect(auditChanges({ tier: { a: 1 } }, { tier: { a: 2 } })).toEqual([
      { field: "tier", from: '{"a":1}', to: '{"a":2}' },
    ]);
  });
});
