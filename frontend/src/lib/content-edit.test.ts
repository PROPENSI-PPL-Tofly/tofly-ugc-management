import { afterEach, describe, expect, it, vi } from "vitest";
import { DecisionError } from "./decisions";
import {
  checkEdit,
  deleteContent,
  deleteMessage,
  editBody,
  editChanges,
  editFieldsOf,
  updateContent,
  type EditableDetail,
} from "./content-edit";

const WINDOW = { earliestDeadline: "2026-11-10", latestDeadline: "2026-12-26" };

function specific(overrides: Partial<EditableDetail> = {}): EditableDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    type: "specific",
    name: "Promo Lebaran",
    brief: "Tunjukkan fitur kirim kilat.",
    deadline: "2026-11-20",
    ...overrides,
  };
}

const evergreen = (overrides: Partial<EditableDetail> = {}) =>
  specific({ type: "evergreen", name: "Evg_3_Rangga Pratama_20112026", brief: "", ...overrides });

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("editFieldsOf", () => {
  it("starts the form from the content as it is", () => {
    expect(editFieldsOf(specific())).toEqual({
      name: "Promo Lebaran",
      brief: "Tunjukkan fitur kirim kilat.",
      deadline: "2026-11-20",
    });
  });
});

describe("checkEdit", () => {
  it("passes a content sent back as it is", () => {
    expect(checkEdit(editFieldsOf(specific()), specific(), WINDOW)).toEqual({});
  });

  it("needs a name and a brief on a Specific item, blank counting as empty (AC 2)", () => {
    expect(
      checkEdit({ name: "  ", brief: "", deadline: "2026-11-20" }, specific(), WINDOW),
    ).toEqual({ name: "Nama konten wajib diisi", brief: "Brief wajib diisi" });
  });

  it("lets an Evergreen item keep an empty brief, which it may go without", () => {
    expect(checkEdit(editFieldsOf(evergreen()), evergreen(), WINDOW)).toEqual({});
  });

  it("needs a deadline", () => {
    expect(
      checkEdit({ ...editFieldsOf(specific()), deadline: "" }, specific(), WINDOW),
    ).toEqual({ deadline: "Deadline wajib diisi" });
  });

  it("accepts the earliest and the H-5 day, and refuses the day outside each (AC 3)", () => {
    const at = (deadline: string) =>
      checkEdit({ ...editFieldsOf(specific()), deadline }, specific(), WINDOW);

    expect(at("2026-11-10")).toEqual({});
    expect(at("2026-12-26")).toEqual({});
    expect(at("2026-11-09")).toEqual({ deadline: "Deadline paling cepat 10 Nov 2026" });
    expect(at("2026-12-27")).toEqual({
      deadline: "Deadline paling lambat 26 Des 2026 (H-5 akhir kontrak)",
    });
  });

  it("does not judge a deadline that is not moving, so a brief can be fixed inside the buffer", () => {
    const close = specific({ deadline: "2026-11-07" });

    expect(
      checkEdit({ ...editFieldsOf(close), brief: "Brief yang benar." }, close, WINDOW),
    ).toEqual({});
  });
});

describe("editChanges", () => {
  it("lists nothing while nothing differs, ignoring spaces around the text", () => {
    expect(
      editChanges({ ...editFieldsOf(specific()), name: " Promo Lebaran " }, specific()),
    ).toEqual([]);
  });

  it("shows the old and new deadline and name, and that the brief changed (AC 4)", () => {
    expect(
      editChanges(
        { name: "Promo Ramadan", brief: "Brief baru.", deadline: "2026-11-25" },
        specific(),
      ),
    ).toEqual([
      ["Deadline", "20 Nov 2026 → 25 Nov 2026"],
      ["Nama", "Promo Lebaran → Promo Ramadan"],
      ["Brief", "diubah"],
    ]);
  });

  it("never lists a name on an Evergreen item, whose name the app writes", () => {
    expect(
      editChanges({ ...editFieldsOf(evergreen()), name: "Lain" }, evergreen()),
    ).toEqual([]);
  });
});

describe("editBody", () => {
  it("sends every field a Specific form shows, trimmed", () => {
    expect(
      editBody({ name: " Promo Ramadan ", brief: " Brief baru. ", deadline: "2026-11-25" }, specific()),
    ).toEqual({ name: "Promo Ramadan", brief: "Brief baru.", deadline: "2026-11-25" });
  });

  it("leaves the name out for an Evergreen item, which the API refuses to rename", () => {
    expect(editBody(editFieldsOf(evergreen()), evergreen())).toEqual({
      brief: "",
      deadline: "2026-11-20",
    });
  });
});

describe("deleteMessage", () => {
  it("warns that the deletion is permanent (AC 6)", () => {
    expect(deleteMessage("specific")).toBe("Konten ini akan dihapus permanen.");
  });

  it("adds the Evergreen quota warning for an Evergreen item (AC 7)", () => {
    expect(deleteMessage("evergreen")).toBe(
      "Konten ini akan dihapus permanen. Kuota Evergreen jadi kurang 1. Jadwalkan ulang lewat Tambah Konten kalau perlu.",
    );
  });
});

describe("updateContent", () => {
  it("patches the content through the /api proxy with a JSON body", async () => {
    const fetch = vi.fn().mockResolvedValue(json(200, { id: "x" }));
    vi.stubGlobal("fetch", fetch);

    await expect(updateContent("a/b", { brief: "Baru" })).resolves.toEqual({ ok: true });

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/contents/a%2Fb");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ brief: "Baru" });
  });

  it("hands back the API's field errors from a 422", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(422, {
          message: "Data konten tidak valid",
          errors: { deadline: "Deadline paling lambat 26 Des 2026 (H-5 akhir kontrak)", other: 1 },
        }),
      ),
    );

    await expect(updateContent("x", { deadline: "2026-12-30" })).resolves.toEqual({
      ok: false,
      status: 422,
      message: "Data konten tidak valid",
      errors: { deadline: "Deadline paling lambat 26 Des 2026 (H-5 akhir kontrak)" },
    });
  });

  it("hands back a 409's reason, with no field errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(409, {
          code: "CONTENT_NOT_EDITABLE",
          message: "Konten hanya bisa diubah atau dihapus selama berstatus Scheduled dan belum ada draft",
        }),
      ),
    );

    await expect(updateContent("x", { brief: "Baru" })).resolves.toEqual({
      ok: false,
      status: 409,
      message: "Konten hanya bisa diubah atau dihapus selama berstatus Scheduled dan belum ada draft",
      errors: {},
    });
  });

  it("never shows a server error's own wording, nor fails on a body that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));

    await expect(updateContent("x", { brief: "Baru" })).resolves.toEqual({
      ok: false,
      status: 500,
      message: "Konten gagal disimpan. Coba lagi.",
      errors: {},
    });
  });

  it("reads a 422 whose body is not JSON, or whose errors are not an object, as no field errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 422 })));
    await expect(updateContent("x", { brief: "Baru" })).resolves.toEqual({
      ok: false,
      status: 422,
      message: "Konten gagal disimpan. Coba lagi.",
      errors: {},
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(422, { message: "Data konten tidak valid", errors: "deadline" })));
    await expect(updateContent("x", { brief: "Baru" })).resolves.toMatchObject({ errors: {} });
  });

  it("reads a request that never arrived as a failure to retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(updateContent("x", { brief: "Baru" })).resolves.toMatchObject({
      ok: false,
      status: 0,
      message: "Konten gagal disimpan. Coba lagi.",
    });
  });
});

describe("deleteContent", () => {
  it("deletes the content through the /api proxy", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);

    await deleteContent("a/b");

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/contents/a%2Fb");
    expect(init.method).toBe("DELETE");
  });

  it("throws the refusal with its status, so a 409 can re-read the content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(409, {
          code: "INVOICE_FINALIZED",
          message: "Invoice sudah difinalisasi. Konten tidak bisa diubah atau dihapus lagi",
        }),
      ),
    );

    const refusal = await deleteContent("x").catch((caught: unknown) => caught);

    expect(refusal).toBeInstanceOf(DecisionError);
    expect(refusal).toMatchObject({
      status: 409,
      message: "Invoice sudah difinalisasi. Konten tidak bisa diubah atau dihapus lagi",
    });
  });

  it("never shows a server error's own wording, nor fails on a body that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 503 })));
    await expect(deleteContent("x")).rejects.toMatchObject({
      status: 503,
      message: "Konten gagal dihapus. Coba lagi.",
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 404 })));
    await expect(deleteContent("x")).rejects.toMatchObject({
      status: 404,
      message: "Konten gagal dihapus. Coba lagi.",
    });
  });
});
