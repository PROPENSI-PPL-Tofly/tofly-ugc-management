import {
  addTier,
  changeMetric,
  draftFromView,
  EMPTY_TIER,
  isRateFormulaDirty,
  MAX_TIERS,
  removeTier,
  tiersProblem,
  toRateFormulaRequest,
  updateTier,
  validateRateFormula,
  type RateFormulaDraft,
  type TierDraft,
} from "./rate-formula";
import { SAVED_FORMULA, UNCONFIGURED_FORMULA } from "./rate-formula.fixture";

function validDraft(): RateFormulaDraft {
  return draftFromView(SAVED_FORMULA);
}

const tier = (threshold: number | null, bonus: number | null): TierDraft => ({ threshold, bonus });

describe("draftFromView", () => {
  it("fills the form with what is saved", () => {
    expect(draftFromView(SAVED_FORMULA)).toEqual({
      latePenaltyPerDay: 50000,
      maxPenaltyDays: 3,
      specificBonus: 100000,
      performanceBonus: {
        instagram: {
          metric: "views",
          tiers: [tier(10000, 150000), tier(40000, 400000)],
        },
        tiktok: { metric: "likes", tiers: [tier(500, 50000)] },
      },
    });
  });

  it("opens a blank form, on Views with one empty tier, when nothing is configured", () => {
    expect(draftFromView(UNCONFIGURED_FORMULA)).toEqual({
      latePenaltyPerDay: null,
      maxPenaltyDays: null,
      specificBonus: null,
      performanceBonus: {
        instagram: { metric: "views", tiers: [EMPTY_TIER] },
        tiktok: { metric: "views", tiers: [EMPTY_TIER] },
      },
    });
  });

  it("does not share its tiers with the saved formula", () => {
    const draft = draftFromView(SAVED_FORMULA);

    draft.performanceBonus.instagram.tiers[0].bonus = 1;

    expect(SAVED_FORMULA.performanceBonus.instagram.tiers[0].bonus).toBe(150000);
  });
});

describe("tier list edits", () => {
  it("changes one tier and leaves the others", () => {
    const tiers = [tier(1, 10), tier(2, 20)];

    expect(updateTier(tiers, 1, { bonus: 99 })).toEqual([tier(1, 10), tier(2, 99)]);
    expect(tiers[1].bonus).toBe(20);
  });

  it("adds an empty tier", () => {
    expect(addTier([tier(1, 10)])).toEqual([tier(1, 10), EMPTY_TIER]);
  });

  it("adds no tier past the maximum of five", () => {
    const full = Array.from({ length: MAX_TIERS }, (_, index) => tier(index + 1, (index + 1) * 10));

    expect(addTier(full)).toBe(full);
  });

  it("removes the tier at an index", () => {
    expect(removeTier([tier(1, 10), tier(2, 20), tier(3, 30)], 1)).toEqual([
      tier(1, 10),
      tier(3, 30),
    ]);
  });

  it("restarts the tiers on one empty row when the metric changes", () => {
    expect(changeMetric("shares")).toEqual({ metric: "shares", tiers: [EMPTY_TIER] });
  });
});

describe("tiersProblem", () => {
  it("accepts tiers whose minimums and bonuses both rise", () => {
    expect(tiersProblem([tier(10000, 150000), tier(40000, 400000)])).toBeUndefined();
  });

  it("accepts a single tier", () => {
    expect(tiersProblem([tier(1, 1)])).toBeUndefined();
  });

  it("accepts the maximum of five tiers", () => {
    const five = [tier(1, 10), tier(2, 20), tier(3, 30), tier(4, 40), tier(5, 50)];

    expect(tiersProblem(five)).toBeUndefined();
  });

  it("accepts tiers typed out of order, since they are sorted on save", () => {
    expect(tiersProblem([tier(40000, 400000), tier(10000, 150000)])).toBeUndefined();
  });

  it("asks for at least one tier", () => {
    expect(tiersProblem([])).toBe("Minimal 1 tier.");
  });

  it.each([
    ["an empty minimum", tier(null, 100)],
    ["an empty bonus", tier(100, null)],
    ["a minimum of 0", tier(0, 100)],
    ["a bonus of 0", tier(100, 0)],
  ])("rejects a tier with %s", (_name, bad) => {
    expect(tiersProblem([bad])).toBe("Minimum dan bonus harus lebih dari 0.");
  });

  it("rejects two tiers with the same minimum", () => {
    expect(tiersProblem([tier(100, 10), tier(100, 20)])).toBe("Minimum tiap tier harus berbeda.");
  });

  it("rejects a bonus that does not rise with the minimum", () => {
    expect(tiersProblem([tier(100, 500), tier(200, 400)])).toBe("Bonus harus naik seiring minimum.");
  });

  it("rejects a bonus equal to the one below it", () => {
    expect(tiersProblem([tier(100, 500), tier(200, 500)])).toBe("Bonus harus naik seiring minimum.");
  });

  it("rejects a number of more than ten digits", () => {
    expect(tiersProblem([tier(10_000_000_000, 100)])).toBe("Angka terlalu besar.");
  });
});

describe("validateRateFormula", () => {
  it("finds nothing wrong with a saved formula", () => {
    expect(validateRateFormula(validDraft())).toEqual({});
  });

  it("accepts 0 for every amount, the lowest allowed", () => {
    const draft = { ...validDraft(), latePenaltyPerDay: 0, maxPenaltyDays: 0, specificBonus: 0 };

    expect(validateRateFormula(draft)).toEqual({});
  });

  it("asks for each amount that is empty, under its own key", () => {
    const draft: RateFormulaDraft = {
      ...validDraft(),
      latePenaltyPerDay: null,
      maxPenaltyDays: null,
      specificBonus: null,
    };

    expect(validateRateFormula(draft)).toEqual({
      latePenaltyPerDay: "Penalti per hari wajib diisi",
      maxPenaltyDays: "Maks hari penalti wajib diisi",
      specificBonus: "Bonus Specific wajib diisi",
    });
  });

  it("rejects an amount of more than ten digits", () => {
    const draft = { ...validDraft(), specificBonus: 10_000_000_000 };

    expect(validateRateFormula(draft).specificBonus).toBe("Bonus Specific maksimal 10 digit");
  });

  it("rejects a negative amount", () => {
    const draft = { ...validDraft(), latePenaltyPerDay: -5 };

    expect(validateRateFormula(draft).latePenaltyPerDay).toBe("Penalti per hari minimal 0");
  });

  it("reports each platform's tier problem under that platform", () => {
    const draft = validDraft();
    draft.performanceBonus.tiktok.tiers = [EMPTY_TIER];

    expect(validateRateFormula(draft)).toEqual({
      "performanceBonus.tiktok": "Minimum dan bonus harus lebih dari 0.",
    });
  });

  it("reports both platforms at once", () => {
    const draft = validDraft();
    draft.performanceBonus.instagram.tiers = [];
    draft.performanceBonus.tiktok.tiers = [tier(1, 5), tier(1, 9)];

    expect(validateRateFormula(draft)).toEqual({
      "performanceBonus.instagram": "Minimal 1 tier.",
      "performanceBonus.tiktok": "Minimum tiap tier harus berbeda.",
    });
  });
});

describe("toRateFormulaRequest", () => {
  it("builds the request from a valid draft", () => {
    expect(toRateFormulaRequest(validDraft())).toEqual({
      latePenaltyPerDay: 50000,
      maxPenaltyDays: 3,
      specificBonus: 100000,
      performanceBonus: {
        instagram: {
          metric: "views",
          tiers: [
            { threshold: 10000, bonus: 150000 },
            { threshold: 40000, bonus: 400000 },
          ],
        },
        tiktok: { metric: "likes", tiers: [{ threshold: 500, bonus: 50000 }] },
      },
    });
  });

  it("sends each platform's tiers in increasing order of minimum", () => {
    const draft = validDraft();
    draft.performanceBonus.instagram.tiers = [tier(40000, 400000), tier(10000, 150000)];

    const { instagram } = toRateFormulaRequest(draft).performanceBonus;

    expect(instagram.tiers.map((each) => each.threshold)).toEqual([10000, 40000]);
  });

  it("refuses a draft with an empty amount", () => {
    const draft = { ...validDraft(), specificBonus: null };

    expect(() => toRateFormulaRequest(draft)).toThrow("not filled in");
  });

  it("refuses a draft with an empty tier", () => {
    const draft = validDraft();
    draft.performanceBonus.instagram.tiers = [EMPTY_TIER];

    expect(() => toRateFormulaRequest(draft)).toThrow("instagram tier");
  });
});

describe("isRateFormulaDirty", () => {
  it("is clean for an untouched copy", () => {
    expect(isRateFormulaDirty(validDraft(), validDraft())).toBe(false);
  });

  it("is dirty once an amount changed", () => {
    expect(isRateFormulaDirty({ ...validDraft(), specificBonus: 1 }, validDraft())).toBe(true);
  });

  it("is dirty once a tier was added", () => {
    const draft = validDraft();
    draft.performanceBonus.tiktok.tiers = addTier(draft.performanceBonus.tiktok.tiers);

    expect(isRateFormulaDirty(draft, validDraft())).toBe(true);
  });
});
