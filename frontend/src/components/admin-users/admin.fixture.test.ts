import { adminUser, listResponse } from "./admin.fixture";

describe("the admin list's fixture", () => {
  it("defaults a response to one admin and ten rows a page", () => {
    const list = listResponse();

    expect(list.items).toHaveLength(1);
    expect(list.pageSize).toBe(10);
    expect(list.total).toBe(1);
    expect(list.totalPages).toBe(1);
  });

  it("reads an explicit item list and total the caller set", () => {
    const [first, second] = [adminUser(), adminUser({ id: "second" })];
    const list = listResponse({ items: [first, second], total: 23, pageSize: 5 });

    expect(list.items).toEqual([first, second]);
    expect(list.total).toBe(23);
    expect(list.pageSize).toBe(5);
    expect(list.totalPages).toBe(5);
  });

  it("counts an empty answer as zero pages", () => {
    expect(listResponse({ items: [], total: 0 }).totalPages).toBe(0);
  });
});
