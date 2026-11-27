import {
  COMMENT_MAX_LENGTH,
  CREATOR_INVOICE_STATUS_LABELS,
  creatorNextStep,
  currentAndHistory,
  invoiceActivity,
  invoiceSteps,
  totalLabel,
  totalNote,
  validateComment,
  type CreatorInvoice,
} from "./creator-invoice";
import { aCreatorInvoice, NONE_REACHED } from "./creator-invoice.builder";
import { INVOICE_STATUS_LABELS, INVOICE_STATUSES, type InvoiceStatus } from "./invoice";

function invoice(overrides: Partial<CreatorInvoice> = {}): CreatorInvoice {
  return aCreatorInvoice(overrides);
}

// PBI-37: the creator reads a cancelled invoice in their own words, never the admin's "Cancelled".
describe("CREATOR_INVOICE_STATUS_LABELS", () => {
  it("calls a cancelled invoice Dibatalkan", () => {
    expect(CREATOR_INVOICE_STATUS_LABELS.cancelled).toBe("Dibatalkan");
  });

  it.each(INVOICE_STATUSES.filter((status) => status !== "cancelled"))(
    "words the %s step as the admin's table does",
    (status) => {
      expect(CREATOR_INVOICE_STATUS_LABELS[status]).toBe(INVOICE_STATUS_LABELS[status]);
    },
  );
});

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

  it("marks a running invoice's first step done, dated by the contract's start, and waits on Final", () => {
    const [running, ...rest] = invoiceSteps(invoice());

    expect(running).toMatchObject({ state: "done", caption: "1 Sep 2026" });
    expect(rest.map((step) => step.state)).toEqual(["current", "todo", "todo", "todo"]);
    expect(rest.map((step) => step.caption)).toEqual([null, null, null, null]);
  });

  it("marks every step reached as done, its own included, and the next as the one it waits on", () => {
    const steps = invoiceSteps(
      invoice({
        status: "creator_acked",
        reachedAt: { ...NONE_REACHED, finalized: "2026-12-01T02:00:00Z", creator_acked: "2026-12-02T02:00:00Z" },
      }),
    );

    expect(steps.map((step) => step.state)).toEqual(["done", "done", "done", "current", "todo"]);
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

  it("waits on Berjalan for a contract that has not started, and says when it starts", () => {
    const steps = invoiceSteps(invoice({ notStarted: true, periodStart: "2026-11-01" }));

    expect(steps.map((step) => step.state)).toEqual(["current", "todo", "todo", "todo", "todo"]);
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

    // A cancelled invoice (PBI-37) offers no move at all.
    expect(actions).toEqual([null, "acknowledge", null, "confirm", null, null]);
  });
});

describe("a cancelled invoice (PBI-37)", () => {
  it("says it was cancelled and offers no move", () => {
    expect(creatorNextStep(invoice({ status: "cancelled" }))).toEqual({ hint: "Dibatalkan", action: null });
  });

  // Off the pipeline: the tracker must not claim it still waits on Berjalan or any step after.
  it("waits on no step of the pipeline", () => {
    expect(invoiceSteps(invoice({ status: "cancelled" })).map((step) => step.state)).not.toContain("current");
  });
});

describe("currentAndHistory", () => {
  it("puts the latest period on top and the earlier ones in the history, latest first", () => {
    const first = invoice({ periodNumber: 1 });
    const second = invoice({ periodNumber: 2 });
    const third = invoice({ periodNumber: 3 });

    expect(currentAndHistory([first, third, second])).toEqual({ current: third, history: [second, first] });
  });

  // PBI-30: a renewal waiting to start is the newest period, but the one running is still "this
  // period"; the renewal sits at the top of the history until it starts.
  it("keeps the running period on top while a newer renewal has not started", () => {
    const first = invoice({ periodNumber: 1 });
    const renewal = invoice({ periodNumber: 2, notStarted: true });

    expect(currentAndHistory([first, renewal])).toEqual({ current: first, history: [renewal] });
  });

  it("puts the newest period on top when none has started", () => {
    const first = invoice({ periodNumber: 1, notStarted: true });
    const second = invoice({ periodNumber: 2, notStarted: true });

    expect(currentAndHistory([first, second])).toEqual({ current: second, history: [first] });
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

describe("validateComment", () => {
  it("accepts a comment with something to say", () => {
    expect(validateComment("Sudah saya cek, terima kasih.")).toBeNull();
  });

  it.each(["", "   ", "\n\t "])("refuses a comment with nothing in it (%j)", (text) => {
    expect(validateComment(text)).toBe("Komentar wajib diisi");
  });

  it("accepts exactly 500 characters, the limit", () => {
    expect(validateComment("a".repeat(COMMENT_MAX_LENGTH))).toBeNull();
  });

  it("refuses 501 characters, one past the limit", () => {
    expect(validateComment("a".repeat(COMMENT_MAX_LENGTH + 1))).toBe("Komentar maksimal 500 karakter");
  });

  it("counts the comment as it will be sent, without the spaces around it", () => {
    expect(validateComment(`  ${"a".repeat(COMMENT_MAX_LENGTH)}  `)).toBeNull();
  });
});

describe("invoiceActivity", () => {
  const COMMENT = {
    id: "c-1",
    authorName: "Rangga Pratama",
    authorRole: "creator" as const,
    text: "Sudah saya cek.",
    createdAt: "2026-12-02T05:00:00Z",
  };

  it("has nothing to show on an invoice nobody has moved or written on", () => {
    expect(invoiceActivity(invoice())).toEqual([]);
  });

  it("words each step the invoice reached from the creator's side", () => {
    const entries = invoiceActivity(
      invoice({
        status: "paid",
        reachedAt: {
          finalized: "2026-12-01T02:00:00Z",
          creator_acked: "2026-12-02T02:00:00Z",
          payment_uploaded: "2026-12-04T02:00:00Z",
          paid: "2026-12-05T02:00:00Z",
        },
      }),
    );

    expect(entries.map((entry) => entry.text)).toEqual([
      "Admin memfinalisasi invoice · Rp550.000",
      "Kamu meng-acknowledge invoice",
      "Admin mengirim bukti bayar",
      "Kamu mengonfirmasi pembayaran diterima",
    ]);
    expect(entries.every((entry) => entry.kind === "event")).toBe(true);
  });

  // PBI-23, 23.11 (client note from UAT, 11 Nov): the acting Admin's name replaces "Admin".
  it("names the Admin who finalized and the Admin who sent the proof, each their own", () => {
    const base = invoice();
    const entries = invoiceActivity(
      invoice({
        status: "payment_uploaded",
        breakdown: { ...base.breakdown, finalizedBy: "Sinta Dewi" },
        reachedAt: {
          ...NONE_REACHED,
          finalized: "2026-12-01T02:00:00Z",
          payment_uploaded: "2026-12-04T02:00:00Z",
        },
        proof: {
          url: "/api/me/invoices/c/payment-proof",
          fileName: "bukti.pdf",
          uploadedAt: "2026-12-04T02:00:00Z",
          uploadedBy: "bima.admin@tofly.id",
        },
      }),
    );

    expect(entries.map((entry) => entry.text)).toEqual([
      "Sinta Dewi memfinalisasi invoice · Rp550.000",
      "bima.admin@tofly.id mengirim bukti bayar",
    ]);
  });

  // The prototype logs `Admin memfinalisasi invoice · ${fmtMoney(p.snapshot.total)}` once, at
  // Finalize, so an adjustment added afterwards moves the invoice's total but never this line.
  describe("the total on the finalized step", () => {
    const FINALIZED_AT = "2026-12-02T02:00:00Z";
    const adjustment = (id: string, amount: number, createdAt: string) => ({
      id,
      amount,
      reason: "Penyesuaian",
      createdAt,
    });
    const finalizedText = (overrides: Partial<CreatorInvoice>) =>
      invoiceActivity(
        invoice({ status: "finalized", reachedAt: { ...NONE_REACHED, finalized: FINALIZED_AT }, ...overrides }),
      ).find((entry) => entry.id === "finalized")?.text;

    it("counts an adjustment added before Finalize", () => {
      expect(
        finalizedText({
          adjustments: [adjustment("before", 50000, "2026-12-01T02:00:00Z")],
          totalAmount: 600000,
        }),
      ).toBe("Admin memfinalisasi invoice · Rp600.000");
    });

    it("counts an adjustment saved at the very moment of Finalize", () => {
      expect(
        finalizedText({ adjustments: [adjustment("same", 50000, FINALIZED_AT)], totalAmount: 600000 }),
      ).toBe("Admin memfinalisasi invoice · Rp600.000");
    });

    it("keeps the total it was finalized at when an adjustment comes one second later", () => {
      expect(
        finalizedText({
          adjustments: [adjustment("after", -75000, "2026-12-02T02:00:01Z")],
          totalAmount: 475000,
        }),
      ).toBe("Admin memfinalisasi invoice · Rp550.000");
    });

    it("counts a measured performance bonus", () => {
      expect(finalizedText({ bonusAmount: 100000, totalAmount: 650000 })).toBe(
        "Admin memfinalisasi invoice · Rp650.000",
      );
    });

    it("says Rp0 when the penalty used the whole pay up", () => {
      expect(finalizedText({ penaltyAmount: 900000, totalAmount: 0, floored: true })).toBe(
        "Admin memfinalisasi invoice · Rp0",
      );
    });

    it("stays at Rp0 when a later adjustment lifts a floored invoice above zero", () => {
      expect(
        finalizedText({
          penaltyAmount: 900000,
          adjustments: [adjustment("after", 300000, "2026-12-03T02:00:00Z")],
          totalAmount: 100000,
        }),
      ).toBe("Admin memfinalisasi invoice · Rp0");
    });

    // PBI-23 AC 25: the backend's frozen total wins; the sums above are for older snapshots only.
    describe("when the snapshot kept the total from Finalize", () => {
      const frozenAt = (finalizedTotal: number) => ({ ...invoice().breakdown, finalizedTotal });

      it("shows it, with an adjustment saved during the last sync that the clock would miss", () => {
        expect(
          finalizedText({
            breakdown: frozenAt(600000),
            adjustments: [adjustment("during-sync", 50000, "2026-12-02T02:00:05Z")],
            totalAmount: 600000,
          }),
        ).toBe("Admin memfinalisasi invoice · Rp600.000");
      });

      it("keeps it when a later adjustment moves the invoice's total", () => {
        expect(
          finalizedText({
            breakdown: frozenAt(550000),
            adjustments: [adjustment("after", -75000, "2026-12-03T02:00:00Z")],
            totalAmount: 475000,
          }),
        ).toBe("Admin memfinalisasi invoice · Rp550.000");
      });

      it("shows a frozen Rp0 as Rp0, not as a missing total", () => {
        expect(finalizedText({ breakdown: frozenAt(0), totalAmount: 100000 })).toBe(
          "Admin memfinalisasi invoice · Rp0",
        );
      });
    });
  });

  it("weaves the comments in among the steps, oldest first", () => {
    const entries = invoiceActivity(
      invoice({
        status: "creator_acked",
        reachedAt: { ...NONE_REACHED, finalized: "2026-12-01T02:00:00Z", creator_acked: "2026-12-03T02:00:00Z" },
        comments: [COMMENT],
      }),
    );

    expect(entries.map((entry) => entry.kind)).toEqual(["event", "comment", "event"]);
  });

  it("puts a step before a comment written at the same moment", () => {
    const at = "2026-12-01T02:00:00Z";
    const entries = invoiceActivity(
      invoice({ status: "finalized", reachedAt: { ...NONE_REACHED, finalized: at }, comments: [{ ...COMMENT, createdAt: at }] }),
    );

    expect(entries.map((entry) => entry.kind)).toEqual(["event", "comment"]);
  });

  it("names an admin's comment by the admin's email and a creator's by their name", () => {
    const entries = invoiceActivity(
      invoice({
        comments: [
          { ...COMMENT, id: "c-1", authorRole: "admin", authorName: "budi.admin@tofly.id" },
          { ...COMMENT, id: "c-2", createdAt: "2026-12-03T05:00:00Z" },
        ],
      }),
    );

    expect(entries.map((entry) => (entry.kind === "comment" ? entry.author : null))).toEqual([
      "budi.admin@tofly.id",
      "Rangga Pratama",
    ]);
  });

  // PBI-23, 23.11, in the prototype's words:
  // `Admin menambah penyesuaian: ${label} (${amount>0?'+':''}${fmtMoney(amount)})`
  describe("an adjustment", () => {
    const ADDITION = {
      id: "adj-1",
      amount: 50000,
      reason: "Reimbursement ongkir produk",
      createdAt: "2026-12-02T02:00:00Z",
      actorName: "Sinta Dewi",
    };
    const DEDUCTION = {
      id: "adj-2",
      amount: -75000,
      reason: "Koreksi kelebihan tagihan",
      createdAt: "2026-12-03T02:00:00Z",
      actorName: "bima.admin@tofly.id",
    };
    const UNNAMED = {
      id: "adj-3",
      amount: 1,
      reason: "Pembulatan",
      createdAt: "2026-12-04T02:00:00Z",
    };

    it("names the Admin who added it, with its reason and a plus on what it adds", () => {
      expect(invoiceActivity(invoice({ adjustments: [ADDITION] }))).toEqual([
        {
          kind: "event",
          id: "adj-1",
          text: "Sinta Dewi menambah penyesuaian: Reimbursement ongkir produk (+Rp50.000)",
          at: "2026-12-02T02:00:00Z",
        },
      ]);
    });

    it("writes a deduction with the prototype's minus, right against the Rp", () => {
      const [entry] = invoiceActivity(invoice({ adjustments: [DEDUCTION] }));

      expect(entry.text).toBe("bima.admin@tofly.id menambah penyesuaian: Koreksi kelebihan tagihan (−Rp75.000)");
    });

    it("says Admin when the API names no one", () => {
      const [entry] = invoiceActivity(invoice({ adjustments: [UNNAMED] }));

      expect(entry.text).toBe("Admin menambah penyesuaian: Pembulatan (+Rp1)");
    });

    it("gives each adjustment its own line, by its own Admin", () => {
      const entries = invoiceActivity(invoice({ adjustments: [ADDITION, DEDUCTION] }));

      expect(entries.map((entry) => entry.id)).toEqual(["adj-1", "adj-2"]);
    });

    it("takes its place by time, also when it was added after Finalize", () => {
      const entries = invoiceActivity(
        invoice({
          status: "finalized",
          reachedAt: { ...NONE_REACHED, finalized: "2026-12-02T12:00:00Z" },
          adjustments: [DEDUCTION, ADDITION],
        }),
      );

      expect(entries.map((entry) => entry.id)).toEqual(["adj-1", "finalized", "adj-2"]);
    });

    it("comes after a step and before a comment of the same moment", () => {
      const at = ADDITION.createdAt;
      const entries = invoiceActivity(
        invoice({
          status: "finalized",
          reachedAt: { ...NONE_REACHED, finalized: at },
          adjustments: [ADDITION],
          comments: [{ ...COMMENT, createdAt: at }],
        }),
      );

      expect(entries.map((entry) => entry.id)).toEqual(["finalized", "adj-1", "c-1"]);
    });
  });
});

// PBI-16 AC 9.
describe("invoiceActivity with fixed rate changes", () => {
  it("weaves each change in with the steps and the comments, by time", () => {
    const change = (id: string, createdAt: string) => ({
      id,
      oldRate: 1_000_000,
      newRate: 2_000_000,
      actorName: null,
      createdAt,
    });
    const entries = invoiceActivity(
      aCreatorInvoice({
        reachedAt: { finalized: "2026-11-20T03:00:00Z", creator_acked: null, payment_uploaded: null, paid: null },
        rateChanges: [change("early", "2026-11-10T03:00:00Z"), change("mid", "2026-11-15T03:00:00Z")],
        comments: [
          { id: "c", authorName: "Salsa", authorRole: "creator", text: "Halo", createdAt: "2026-11-12T03:00:00Z" },
        ],
      }),
    );

    expect(entries.map((entry) => entry.id)).toEqual(["rate-early", "c", "rate-mid", "finalized"]);
  });
});

describe("totalLabel for an invoice an early end cancelled", () => {
  it("says the total is not paid, and adds no note that it may still change", () => {
    expect(totalLabel("cancelled")).toBe("Dibatalkan, tidak dibayar");
    expect(totalNote("cancelled")).toBeNull();
  });
});
