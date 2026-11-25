import type { CreatorPeriod, CreatorProfile } from "./creator-detail";
import {
  editChanges,
  editLocks,
  editRequest,
  initialEdit,
  nextPeriod,
  readUsernameLocks,
  savedMessage,
  validateCreatorEdit,
  type CreatorEditInput,
  type UsernameLocks,
} from "./creator-edit";
import { NOT_CONNECTED } from "./social-connection";

const UNLOCKED: UsernameLocks = { instagram: null, tiktok: null };

const CREATOR: CreatorProfile = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Salsa Amelia",
  email: "salsa@example.com",
  socials: { instagram: "salsa.ig" },
  accessRevokeDate: null,
};

function period(overrides: Partial<CreatorPeriod> = {}): CreatorPeriod {
  return {
    contractId: "22222222-2222-4222-8222-222222222222",
    periodNumber: 2,
    type: "probation",
    startDate: "2026-09-01",
    endDate: "2026-12-15",
    status: "active",
    contentQuota: 6,
    evergreenCount: 5,
    remainingEvergreenQuota: 1,
    daysBetween: 14,
    fixedRate: 4_000_000,
    invoiceStatus: "running",
    evergreenPlanned: 5,
    earlyEndReason: null,
    progress: { submitted: 0, total: 6, percent: 0 },
    performance: { onTimeRate: null, avgRevisions: 0, productivity: "no_data", productivityLabel: "Belum Ada Data" },
    ...overrides,
  };
}

const INITIAL = initialEdit(CREATOR, period());

function input(overrides: Partial<CreatorEditInput> = {}): CreatorEditInput {
  return { ...INITIAL, ...overrides };
}

describe("initialEdit", () => {
  it("opens on the creator and the period as they are", () => {
    expect(INITIAL).toEqual({
      name: "Salsa Amelia",
      email: "salsa@example.com",
      instagramUsername: "salsa.ig",
      tiktokUsername: "",
      contractType: "probation",
      fixedRate: 4_000_000,
      contractEnd: "2026-12-15",
      quota: 6,
    });
  });

  it("has no terms for a creator without a contract", () => {
    expect(initialEdit({ ...CREATOR, socials: { tiktok: "salsa.tt" } }, null)).toMatchObject({
      instagramUsername: "",
      tiktokUsername: "salsa.tt",
      contractType: "",
      fixedRate: null,
      contractEnd: "",
      quota: 0,
    });
  });
});

describe("readUsernameLocks", () => {
  const connections = { instagram: NOT_CONNECTED, tiktok: { ...NOT_CONNECTED, connected: true } };

  it("reads each lock the server names", () => {
    expect(readUsernameLocks({ instagram: "link_submitted", tiktok: "connected" }, connections)).toEqual({
      instagram: "link_submitted",
      tiktok: "connected",
    });
    expect(readUsernameLocks({ instagram: null, tiktok: null }, connections)).toEqual(UNLOCKED);
  });

  it.each([undefined, null, "x", { instagram: "other", tiktok: 7 }])(
    "falls back on the connection for %j",
    (raw) => {
      expect(readUsernameLocks(raw, connections)).toEqual({ instagram: null, tiktok: "connected" });
    },
  );
});

describe("editLocks", () => {
  it("locks only the start and the interval on an active period with a running invoice", () => {
    expect(editLocks(UNLOCKED, period())).toEqual({
      contractStart: "Tidak bisa diubah setelah periode dimulai.",
      interval: "Tidak bisa diubah setelah periode dimulai.",
    });
  });

  it("says why each username is read-only", () => {
    expect(editLocks({ instagram: "connected", tiktok: "link_submitted" }, null)).toEqual({
      instagramUsername: "Mengikuti akun yang terhubung.",
      tiktokUsername: "Sudah ada link konten yang dikirim di platform ini.",
    });
  });

  it.each([
    ["ended", period({ status: "expired" }), "Periode ini sudah berakhir."],
    [
      "ended early but still running",
      period({ earlyEnd: { originalEndDate: "2026-12-31", reason: "other" } as CreatorPeriod["earlyEnd"] }),
      "Kontrak ini sudah diakhiri lebih awal.",
    ],
    ["not started", period({ status: "upcoming" }), "Ubah lewat tombol Ubah Periode."],
  ])("locks the end and the quota of a period that is %s", (_label, locked, reason) => {
    const locks = editLocks(UNLOCKED, locked);
    expect(locks.contractEnd).toBe(reason);
    expect(locks.quota).toBe(reason);
    expect(locks.contractType).toBeUndefined();
  });

  it("sends the whole schedule of a period not started to Ubah Periode", () => {
    const locks = editLocks(UNLOCKED, period({ status: "upcoming" }));
    expect(locks.contractStart).toBe("Ubah lewat tombol Ubah Periode.");
    expect(locks.interval).toBe("Ubah lewat tombol Ubah Periode.");
  });

  it("keeps the fixed rate open on an ended period whose invoice still runs", () => {
    expect(editLocks(UNLOCKED, period({ status: "expired" })).fixedRate).toBeUndefined();
  });

  // An answer without the status fails closed: the server would refuse it as well.
  it.each(["finalized", "creator_acked", "payment_uploaded", "paid", "cancelled", undefined] as const)(
    "locks the fixed rate while the invoice is %s",
    (invoiceStatus) => {
      expect(editLocks(UNLOCKED, period({ invoiceStatus })).fixedRate).toBe(
        "Hanya bisa diubah selama invoice masih berjalan.",
      );
    },
  );
});

describe("nextPeriod", () => {
  it("is the earliest period that starts after this one", () => {
    const third = period({ periodNumber: 3, startDate: "2027-01-01" });
    const fourth = period({ periodNumber: 4, startDate: "2027-04-01" });
    const first = period({ periodNumber: 1, startDate: "2026-03-01" });
    expect(nextPeriod(period(), [fourth, third, period(), first])).toBe(third);
    expect(nextPeriod(fourth, [fourth, third])).toBeNull();
    expect(nextPeriod(null, [third])).toBeNull();
  });
});

describe("validateCreatorEdit", () => {
  const check = (changes: Partial<CreatorEditInput>, current: CreatorPeriod | null = period(), next: CreatorPeriod | null = null) =>
    validateCreatorEdit(input(changes), INITIAL, current, next);

  it("has nothing to say about a form as it opened", () => {
    expect(check({})).toEqual({});
  });

  it.each([
    [{ name: " " }, { name: "Nama wajib diisi" }],
    [{ name: "a".repeat(101) }, { name: "Nama maksimal 100 karakter" }],
    [{ email: "salsa@" }, { email: "Format email tidak valid" }],
    [{ instagramUsername: "a".repeat(101) }, { instagramUsername: "Username maksimal 100 karakter" }],
    [{ tiktokUsername: "a".repeat(101) }, { tiktokUsername: "Username maksimal 100 karakter" }],
    [{ contractType: "" as const }, { contractType: "Jenis kontrak wajib dipilih" }],
    [{ fixedRate: null }, { fixedRate: "Fixed rate wajib diisi" }],
    [{ fixedRate: 0 }, { fixedRate: "Fixed rate harus lebih dari 0" }],
    [{ fixedRate: 10_000_001 }, { fixedRate: "Fixed rate maksimal Rp10.000.000" }],
    [{ quota: 0 }, { quota: "Jumlah konten harus lebih dari 0" }],
    [{ quota: 101 }, { quota: "Jumlah konten maksimal 100" }],
    [{ quota: 4 }, { quota: "Minimal 5, sesuai konten Evergreen yang sudah ada" }],
    [{ contractEnd: "" }, { contractEnd: "Tanggal berakhir wajib diisi" }],
    [{ contractEnd: "2026-12-14" }, { contractEnd: "Akhir kontrak hanya bisa dimundurkan dari 15 Des 2026" }],
  ])("refuses %j", (changes, errors) => {
    expect(check(changes)).toEqual(errors);
  });

  it.each([{ instagramUsername: "" }, { quota: 5 }, { fixedRate: 10_000_000 }, { contractEnd: "2027-12-31" }])(
    "accepts %j",
    (changes) => {
      expect(check(changes)).toEqual({});
    },
  );

  it("leaves the next period its first day", () => {
    const next = period({ periodNumber: 3, startDate: "2027-01-01" });
    expect(check({ contractEnd: "2026-12-31" }, period(), next)).toEqual({});
    expect(check({ contractEnd: "2027-01-01" }, period(), next)).toEqual({
      contractEnd: "Paling lambat 31 Des 2026, sehari sebelum Periode 3 mulai",
    });
  });

  // A stored value from before today's rules must not block fixing another field.
  it("does not judge a field left as it was", () => {
    const opened = { ...INITIAL, fixedRate: 0, quota: 0 };
    expect(validateCreatorEdit({ ...opened, name: "Rani" }, opened, period(), null)).toEqual({});
  });

  it("asks nothing of the quota against Evergreen when the count is not known", () => {
    expect(check({ quota: 1 }, period({ evergreenPlanned: undefined }))).toEqual({});
    expect(check({ quota: 1 }, null)).toEqual({});
  });
});

describe("editChanges", () => {
  it("is empty for a form as it opened, padding aside", () => {
    expect(editChanges(input({ name: " Salsa Amelia ", email: "salsa@example.com " }), INITIAL)).toEqual([]);
  });

  it("counts another case of the same email as no change", () => {
    expect(editChanges(input({ email: "SALSA@example.com" }), INITIAL)).toEqual([]);
  });

  it("lists every change with what it was and what it becomes", () => {
    expect(
      editChanges(
        input({
          name: "Rani",
          email: "rani@example.com",
          instagramUsername: "",
          tiktokUsername: "rani.tt",
          contractType: "regular",
          fixedRate: 4_500_000,
          contractEnd: "2026-12-31",
          quota: 8,
        }),
        INITIAL,
      ).map(({ label, from, to }) => [label, from, to]),
    ).toEqual([
      ["Nama Creator", "Salsa Amelia", "Rani"],
      ["Email", "salsa@example.com", "rani@example.com"],
      ["Username Instagram", "@salsa.ig", "Kosong"],
      ["Username TikTok", "Kosong", "@rani.tt"],
      ["Jenis Kontrak", "Probation", "Regular"],
      ["Fixed Rate", "Rp4.000.000", "Rp4.500.000"],
      ["Akhir Kontrak", "15 Des 2026", "31 Des 2026"],
      ["Jumlah Konten", "6", "8"],
    ]);
  });
});

describe("editRequest", () => {
  // The exact keys the controller reads (backend creator-edit.ts): a key spelled otherwise would
  // be dropped there without a word.
  it("sends every changed field under the API's names, trimmed, with the period they belong to", () => {
    expect(
      editRequest(
        input({
          name: " Rani ",
          email: " rani@example.com ",
          instagramUsername: " ",
          tiktokUsername: " rani.tt ",
          contractType: "regular",
          fixedRate: 4_500_000,
          contractEnd: "2026-12-31",
          quota: 8,
        }),
        INITIAL,
        period(),
      ),
    ).toEqual({
      name: "Rani",
      email: "rani@example.com",
      instagramUsername: "",
      tiktokUsername: "rani.tt",
      contractId: "22222222-2222-4222-8222-222222222222",
      contractType: "regular",
      fixedRate: 4_500_000,
      contractEnd: "2026-12-31",
      quota: 8,
    });
  });

  it("sends only what changed, and no period when no term did", () => {
    expect(editRequest(input({ name: "Rani" }), INITIAL, period())).toEqual({ name: "Rani" });
    expect(editRequest(input({ quota: 7 }), INITIAL, period())).toEqual({
      contractId: "22222222-2222-4222-8222-222222222222",
      quota: 7,
    });
    expect(editRequest(input({ name: "Rani" }), INITIAL, null)).toEqual({ name: "Rani" });
  });
});

describe("savedMessage", () => {
  it.each([
    [{ name: "Rani" }, "Data creator disimpan."],
    [{ email: "rani@example.com" }, "Data creator disimpan. Sesi creator diakhiri."],
    [{ fixedRate: 1 }, "Data creator disimpan. Invoice Periode 2 dihitung ulang."],
    [{ quota: 8 }, "Data creator disimpan. 3 slot Evergreen belum dialokasikan."],
    [{ quota: 5 }, "Data creator disimpan."],
    [
      { email: "rani@example.com", fixedRate: 1, quota: 6 },
      "Data creator disimpan. Sesi creator diakhiri. Invoice Periode 2 dihitung ulang. 1 slot Evergreen belum dialokasikan.",
    ],
  ])("says what saving %j did", (request, message) => {
    expect(savedMessage(request, period())).toBe(message);
  });

  it("names no period for a creator without one", () => {
    expect(savedMessage({ name: "Rani" }, null)).toBe("Data creator disimpan.");
  });
});
