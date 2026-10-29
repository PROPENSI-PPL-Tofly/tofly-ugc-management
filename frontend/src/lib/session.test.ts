import { APP_NAME, homeFor } from "./session";

describe("homeFor", () => {
  it("starts an admin on the Creator Database and a creator on their Dashboard", () => {
    expect(homeFor("admin")).toBe("/admin/creators");
    expect(homeFor("creator")).toBe("/creator/dashboard");
  });

  it("names the product in full", () => {
    expect(APP_NAME).toBe("Tofly Creator Management System");
  });
});
