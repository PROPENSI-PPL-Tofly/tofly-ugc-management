import { readLastSync, readWaitingLinks, syncNote } from "./finalize-sync";

const NAMED = { contentId: "c-1", contentName: "Evg_1", platform: "tiktok", state: "sync_failed" };

describe("readLastSync (PBI-28 AC 8)", () => {
  it("reads how the last sync went and the links it did not update", () => {
    expect(readLastSync({ status: "done", notUpdated: [NAMED] })).toEqual({
      status: "done",
      notUpdated: [NAMED],
    });
  });

  it.each([
    ["nothing", undefined],
    ["an unknown status", { status: "maybe", notUpdated: [] }],
    ["a list that is not one", { status: "done", notUpdated: "c-1" }],
  ])("reads %s as no sync", (_label, value) => {
    expect(readLastSync(value)).toEqual({ status: "unavailable", notUpdated: [] });
  });

  it("leaves out an entry that is not a link the admin can be told about", () => {
    expect(
      readLastSync({
        status: "failed",
        notUpdated: [NAMED, { ...NAMED, platform: "youtube" }, { ...NAMED, state: "odd" }, "c-2", null],
      }).notUpdated,
    ).toEqual([NAMED]);
  });
});

describe("readWaitingLinks (PBI-28 AC 9)", () => {
  it("reads each link still without data, with the metric it waits on", () => {
    const waiting = { ...NAMED, state: "not_connected", metric: "likes" };

    expect(readWaitingLinks([waiting, { ...waiting, metric: "reach" }])).toEqual([waiting]);
  });

  it("reads anything that is not a list as none", () => {
    expect(readWaitingLinks({ c: 1 })).toEqual([]);
  });
});

describe("syncNote (AC 7, 8)", () => {
  it("says nothing when the sync updated everything, or when there is no sync yet", () => {
    expect(syncNote({ status: "done", notUpdated: [] })).toBeNull();
    expect(syncNote({ status: "unavailable", notUpdated: [] })).toBeNull();
  });

  it("says some links kept their stored numbers", () => {
    expect(syncNote({ status: "done", notUpdated: [NAMED as never] })).toBe(
      "1 link tidak diperbarui, jadi invoice memakai angka yang tersimpan.",
    );
  });

  it("says the sync failed and the stored numbers were used", () => {
    expect(syncNote({ status: "failed", notUpdated: [NAMED as never, NAMED as never] })).toBe(
      "Sinkronisasi terakhir gagal. 2 link memakai angka yang tersimpan.",
    );
  });

  it("says the sync took longer than 20 seconds", () => {
    expect(syncNote({ status: "timed_out", notUpdated: [NAMED as never] })).toBe(
      "Sinkronisasi terakhir lebih dari 20 detik. 1 link memakai angka yang tersimpan.",
    );
  });
});
