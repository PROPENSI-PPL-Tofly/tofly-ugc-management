import {
  creatorNextStep,
  currentAndHistory,
  invoiceSteps,
  totalLabel,
  totalNote,
  type CreatorInvoice,
} from "./creator-invoice";
import { aCreatorInvoice, NONE_REACHED } from "./creator-invoice.builder";
import { INVOICE_STATUSES, type InvoiceStatus } from "./invoice";

function invoice(overrides: Partial<CreatorInvoice> = {}): CreatorInvoice {
  return aCreatorInvoice(overrides);
}

describe("totalLabel", () => {
  it("calls a running total an estimate, since it moves until the invoice is frozen", () => {
    expect(totalLabel("accruing")).toBe("Estimasi Pendapatan");
  });

  it.each(["finalized", "creator_acked", "payment_uploaded"] as const)(
    "calls the total final once the invoice is %s",
    (status) => {
      expect(totalLabel(status)).toBe("Total Final");
    },
  );

  it("calls a paid total what was paid", () => {
    expect(totalLabel("paid")).toBe("Total Dibayarkan");
  });
});

describe("totalNote", () => {
  it.each(["accruing", "finalized"] as const)(
    "warns that a %s total can still change until the creator acknowledges it",
    (status) => {
      expect(totalNote(status)).toBe("Bisa berubah sampai kamu acknowledge invoice.");
    },
  );

  it.each(["creator_acked", "payment_uploaded", "paid"] as const)(
    "says nothing once the creator has acknowledged (%s)",
    (status) => {
      expect(totalNote(status)).toBeNull();
    },
  );
});

describe("invoiceSteps", () => {
  it("walks the prototype's five steps in order", () => {
    expect(invoiceSteps(invoice()).map((step) => step.label)).toEqual([
      "Berjalan",
      "Final",
      "Di-ack Creator",
      "Bukti Bayar",
      "Paid",
    ]);
  });

  it("marks a running invoice's first step as current, dated by the contract's start", () => {
    const [running, ...rest] = invoiceSteps(invoice());

    expect(running).toMatchObject({ state: "current", caption: "1 Sep 2026" });
    expect(rest.map((step) => step.state)).toEqual(["todo", "todo", "todo", "todo"]);
    expect(rest.map((step) => step.caption)).toEqual([null, null, null, null]);
  });

  it("marks the steps before the invoice's status as done and dates each one reached", () => {
    const steps = invoiceSteps(
      invoice({
        status: "creator_acked",
        reachedAt: { ...NONE_REACHED, finalized: "2026-12-01T02:00:00Z", creator_acked: "2026-12-02T02:00:00Z" },
      }),
    );

    expect(steps.map((step) => step.state)).toEqual(["done", "done", "current", "todo", "todo"]);
    expect(steps.map((step) => step.caption)).toEqual(["1 Sep 2026", "1 Des 2026", "2 Des 2026", null, null]);
  });

  it("marks every step done once paid, the last one included", () => {
    const steps = invoiceSteps(invoice({ status: "paid" }));

    expect(steps.map((step) => step.state)).toEqual(["done", "done", "done", "done", "done"]);
  });

  it("dates a step by Jakarta's day, not UTC's", () => {
    // 18.30 UTC on 1 Dec is 01.30 WIB on 2 Dec.
    const [, finalized] = invoiceSteps(
      invoice({ status: "finalized", reachedAt: { ...NONE_REACHED, finalized: "2026-12-01T18:30:00Z" } }),
    );

    expect(finalized.caption).toBe("2 Des 2026");
  });

  it("leaves a step undated when its moment is not a readable instant", () => {
    const [, finalized] = invoiceSteps(
      invoice({ status: "finalized", reachedAt: { ...NONE_REACHED, finalized: "not-a-date" } }),
    );

    expect(finalized.caption).toBeNull();
  });

  it("has no current step for a contract that has not started, and says when it starts", () => {
    const steps = invoiceSteps(invoice({ notStarted: true, periodStart: "2026-11-01" }));

    expect(steps.map((step) => step.state)).toEqual(["todo", "todo", "todo", "todo", "todo"]);
    expect(steps[0].caption).toBe("mulai 1 Nov 2026");
  });
});

describe("creatorNextStep", () => {
  it("asks the creator to check and acknowledge a finalized invoice", () => {
    expect(creatorNextStep(invoice({ status: "finalized" }))).toEqual({
      hint: "Cek rincian, lalu acknowledge.",
      action: "acknowledge",
    });
  });

  it("asks the creator to confirm a payment once the proof is in", () => {
    expect(creatorNextStep(invoice({ status: "payment_uploaded" }))).toEqual({
      hint: "Admin sudah mengirim bukti bayar.",
      action: "confirm",
    });
  });

  it("tells the creator an acknowledged invoice waits on the admin's proof, with nothing to press", () => {
    expect(creatorNextStep(invoice({ status: "creator_acked" }))).toEqual({
      hint: "Menunggu bukti bayar dari Admin.",
      action: null,
    });
  });

  it("offers nothing on a running invoice, which only the admin can move", () => {
    expect(creatorNextStep(invoice())).toEqual({ hint: null, action: null });
  });

  it("says a contract that has not started has not started", () => {
    expect(creatorNextStep(invoice({ notStarted: true }))).toEqual({
      hint: "Kontrak belum dimulai.",
      action: null,
    });
  });

  it("says a paid invoice is settled", () => {
    expect(creatorNextStep(invoice({ status: "paid" }))).toEqual({ hint: "Lunas", action: null });
  });

  it("offers acknowledge only on a finalized invoice and confirm only once the proof is in", () => {
    const actions = INVOICE_STATUSES.map((status: InvoiceStatus) => creatorNextStep(invoice({ status })).action);

    expect(actions).toEqual([null, "acknowledge", null, "confirm", null]);
  });
});

describe("currentAndHistory", () => {
  it("puts the latest period on top and the earlier ones in the history, latest first", () => {
    const first = invoice({ periodNumber: 1 });
    const second = invoice({ periodNumber: 2 });
    const third = invoice({ periodNumber: 3 });

    expect(currentAndHistory([first, third, second])).toEqual({ current: third, history: [second, first] });
  });

  it("has no current invoice and no history when the creator has none", () => {
    expect(currentAndHistory([])).toEqual({ current: null, history: [] });
  });

  it("leaves the list it was given in its order", () => {
    const list = [invoice({ periodNumber: 1 }), invoice({ periodNumber: 2 })];

    currentAndHistory(list);

    expect(list.map((item) => item.periodNumber)).toEqual([1, 2]);
  });
});
