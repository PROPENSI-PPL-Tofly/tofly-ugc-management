import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS_BY_CATEGORY,
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_LABELS,
  actionsInCategories,
  keepActionsInCategories,
} from "./audit-log";

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
