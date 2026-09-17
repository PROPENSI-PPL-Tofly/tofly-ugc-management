import { updateQuery } from "./query";

describe("updateQuery", () => {
  it("sets a parameter that was not there", () => {
    expect(updateQuery("", { contract: "active" })).toBe("contract=active");
  });

  it("replaces a parameter that was", () => {
    expect(updateQuery("contract=active", { contract: "expired" })).toBe("contract=expired");
  });

  it("drops a parameter set back to its neutral value", () => {
    expect(updateQuery("contract=active&q=rangga", { contract: "" })).toBe("q=rangga");
  });

  it("leaves the parameters it was not asked about alone", () => {
    expect(updateQuery("q=rangga&productivity=good", { contract: "active" })).toBe(
      "q=rangga&productivity=good&contract=active",
    );
  });

  it("sends the reader back to the first page when the filters change", () => {
    expect(updateQuery("page=4&q=rangga", { contract: "active" })).toBe(
      "q=rangga&contract=active",
    );
  });

  it("keeps the page when the page itself is what changed", () => {
    expect(updateQuery("q=rangga", { page: "3" })).toBe("q=rangga&page=3");
  });

  it("drops the page number rather than spelling out the first page", () => {
    expect(updateQuery("q=rangga&page=3", { page: "1" })).toBe("q=rangga");
  });

  it("escapes values instead of trusting them", () => {
    expect(updateQuery("", { q: "a&b=c" })).toBe("q=a%26b%3Dc");
  });
});
