import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS_BY_CATEGORY,
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_LABELS,
  AUDIT_LOG_PAGE_SIZE,
  actionsInCategories,
  buildAuditLogQuery,
  keepActionsInCategories,
  parseAuditLogParams,
} from "./audit-log";

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

  it("ignores a range that ends before it starts", () => {
    expect(parseAuditLogParams({ from: "2026-11-30", to: "2026-11-01" })).toEqual(NO_FILTERS);
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

  it.each(["0", "-1", "1.5", "abc"])("reads a page of %s as the first", (page) => {
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
