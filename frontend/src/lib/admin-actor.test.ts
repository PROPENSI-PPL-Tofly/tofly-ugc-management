import { ADMIN_LABEL, readActorName } from "./admin-actor";

describe("readActorName (PBI-23, 23.11)", () => {
  it("keeps the name the API gave", () => {
    expect(readActorName("Sinta Dewi")).toBe("Sinta Dewi");
  });

  it("keeps an email, which the API sends for an Admin with no name yet", () => {
    expect(readActorName("sinta.admin@tofly.id")).toBe("sinta.admin@tofly.id");
  });

  it("drops the spaces around a name", () => {
    expect(readActorName("  Sinta Dewi ")).toBe("Sinta Dewi");
  });

  // An answer from before 23.10, or a field that drifted, names no one rather than breaking.
  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty", ""],
    ["only spaces", "   "],
    ["a number", 7],
    ["an object", { name: "Sinta" }],
  ])("reads %s as no name", (_label, value) => {
    expect(readActorName(value)).toBeUndefined();
  });
});

describe("ADMIN_LABEL", () => {
  it("is what a step says when no account is named", () => {
    expect(ADMIN_LABEL).toBe("Admin");
  });
});
