import type { CreatorInvoice } from "./creator-invoice";
import {
  PROPOSAL_BRIEF_MAX,
  PROPOSAL_NAME_MAX,
  PROPOSAL_NOTES_MAX,
  checkProposal,
  proposalContract,
  proposalWindow,
  proposalWindowFor,
  proposalWindowLabel,
  toProposalBody,
  type ProposalFields,
} from "./creator-proposal";

// The contract in PBI-14's example: today 16 Nov, buffer 5, so the window is 21 Nov to 26 Des.
const TODAY = "2026-11-16";
const CONTRACT = { periodStart: "2026-10-01", periodEnd: "2026-12-31" };
const WINDOW = { first: "2026-11-21", last: "2026-12-26" };

function invoice(overrides: Partial<CreatorInvoice> = {}): CreatorInvoice {
  return {
    contractId: "11111111-1111-4111-8111-111111111111",
    periodNumber: 1,
    periodStart: CONTRACT.periodStart,
    periodEnd: CONTRACT.periodEnd,
    notStarted: false,
    status: "accruing",
    ...overrides,
  } as CreatorInvoice;
}

function fields(overrides: Partial<ProposalFields> = {}): ProposalFields {
  return {
    name: "Review Sunscreen Gel di Pantai",
    brief: "Pakai gel di pantai, tunjukkan teksturnya.",
    deadline: "2026-12-01",
    notes: "",
    ...overrides,
  };
}

describe("the proposal's limits (PBI-14 AC 1)", () => {
  it("allows a 100-character name, a 1,000-character brief and 500-character notes", () => {
    expect([PROPOSAL_NAME_MAX, PROPOSAL_BRIEF_MAX, PROPOSAL_NOTES_MAX]).toEqual([100, 1000, 500]);
  });
});

// AC 2: from the later of the contract start and today plus the buffer, up to the end minus it.
describe("proposalWindow", () => {
  it("starts from today plus the buffer once the contract has started", () => {
    expect(proposalWindow({ ...CONTRACT, today: TODAY, bufferDays: 5 })).toEqual(WINDOW);
  });

  it("starts from the contract start plus the buffer before the contract has started", () => {
    expect(
      proposalWindow({ periodStart: "2026-12-01", periodEnd: "2027-02-28", today: TODAY, bufferDays: 5 }),
    ).toEqual({ first: "2026-12-06", last: "2027-02-23" });
  });

  it("follows the buffer a Super Admin set (PBI-23)", () => {
    expect(proposalWindow({ ...CONTRACT, today: TODAY, bufferDays: 7 })).toEqual({
      first: "2026-11-23",
      last: "2026-12-24",
    });
  });

  it("keeps a window of one day", () => {
    expect(
      proposalWindow({ periodStart: "2026-10-01", periodEnd: "2026-11-26", today: TODAY, bufferDays: 5 }),
    ).toEqual({ first: "2026-11-21", last: "2026-11-21" });
  });

  it("has no window once no day is left between the two lines", () => {
    expect(
      proposalWindow({ periodStart: "2026-10-01", periodEnd: "2026-11-25", today: TODAY, bufferDays: 5 }),
    ).toBeNull();
  });
});

describe("proposalWindowLabel", () => {
  it("names the window as the tooltip and the error say it", () => {
    expect(proposalWindowLabel(WINDOW)).toBe("Pilih antara 21 Nov 2026 dan 26 Des 2026");
  });
});

// AC 3: only a creator with an active contract may propose.
describe("proposalContract", () => {
  it("is the running contract that today falls in", () => {
    expect(proposalContract([invoice()], TODAY)).toEqual(CONTRACT);
  });

  it.each([
    ["a finalized invoice", invoice({ status: "finalized" })],
    ["a cancelled invoice", invoice({ status: "cancelled" })],
    ["a contract that has not started", invoice({ notStarted: true })],
    ["a contract that ended before today", invoice({ periodEnd: "2026-11-15" })],
  ])("is nothing for %s", (_, row) => {
    expect(proposalContract([row], TODAY)).toBeNull();
  });

  it("is nothing for a creator without invoices", () => {
    expect(proposalContract([], TODAY)).toBeNull();
  });

  it("picks the running contract next to a finished one", () => {
    const finished = invoice({ periodNumber: 1, periodStart: "2026-07-01", periodEnd: "2026-09-30", status: "paid" });
    const running = invoice({ periodNumber: 2 });

    expect(proposalContract([finished, running], TODAY)).toEqual(CONTRACT);
  });
});

describe("proposalWindowFor", () => {
  it("is the running contract's window", () => {
    expect(proposalWindowFor([invoice()], TODAY, 5)).toEqual(WINDOW);
  });

  it("is nothing without a running contract", () => {
    expect(proposalWindowFor([invoice({ status: "paid" })], TODAY, 5)).toBeNull();
  });

  it("is nothing when the running contract has no day left to propose", () => {
    expect(proposalWindowFor([invoice({ periodEnd: "2026-11-25" })], TODAY, 5)).toBeNull();
  });
});

// AC 1 and AC 2, in the prototype's words: one message per field.
describe("checkProposal", () => {
  it("finds nothing wrong with a complete proposal inside the window", () => {
    expect(checkProposal(fields(), WINDOW)).toEqual({});
  });

  it("asks for the name, the brief and the deadline", () => {
    expect(checkProposal(fields({ name: "  ", brief: "", deadline: "" }), WINDOW)).toEqual({
      name: "Nama konten wajib diisi",
      brief: "Brief wajib diisi",
      deadline: "Pilih deadline",
    });
  });

  it.each([
    ["a day before the window", "2026-11-20"],
    ["a day after the window", "2026-12-27"],
  ])("names the window for %s", (_, deadline) => {
    expect(checkProposal(fields({ deadline }), WINDOW)).toEqual({
      deadline: "Pilih antara 21 Nov 2026 dan 26 Des 2026",
    });
  });

  it.each([WINDOW.first, WINDOW.last])("takes %s, an edge of the window", (deadline) => {
    expect(checkProposal(fields({ deadline }), WINDOW)).toEqual({});
  });

  it("refuses text longer than its limit", () => {
    expect(
      checkProposal(
        fields({ name: "a".repeat(101), brief: "b".repeat(1001), notes: "c".repeat(501) }),
        WINDOW,
      ),
    ).toEqual({
      name: "Nama konten maksimal 100 karakter",
      brief: "Brief maksimal 1.000 karakter",
      notes: "Catatan maksimal 500 karakter",
    });
  });

  it("takes text exactly at its limit, and no notes at all", () => {
    expect(
      checkProposal(fields({ name: "a".repeat(100), brief: "b".repeat(1000), notes: "c".repeat(500) }), WINDOW),
    ).toEqual({});
  });

  // As the API counts it: the spaces around the text are trimmed before its length is checked.
  it("counts text without the spaces around it", () => {
    expect(
      checkProposal(
        fields({ name: ` ${"a".repeat(100)} `, brief: ` ${"b".repeat(1000)} `, notes: ` ${"c".repeat(500)} ` }),
        WINDOW,
      ),
    ).toEqual({});
  });
});

describe("toProposalBody", () => {
  it("sends the trimmed text, and no notes as null", () => {
    expect(toProposalBody(fields({ name: "  Review  ", brief: " Brief ", notes: "   " }))).toEqual({
      name: "Review",
      brief: "Brief",
      deadline: "2026-12-01",
      notes: null,
    });
  });

  it("sends notes the creator wrote", () => {
    expect(toProposalBody(fields({ notes: " Tolong kirim produk " })).notes).toBe("Tolong kirim produk");
  });
});
