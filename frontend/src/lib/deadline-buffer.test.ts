import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BUFFER_DAYS,
  MAX_BUFFER_DAYS,
  MIN_BUFFER_DAYS,
  bufferChangeDetails,
  checkBufferDays,
  parseBufferDays,
  saveDeadlineBuffer,
} from "./deadline-buffer";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buffer limits", () => {
  it("holds one buffer between 1 and 14 days, 5 unless a Super Admin changes it (PBI-23 AC)", () => {
    expect([MIN_BUFFER_DAYS, DEFAULT_BUFFER_DAYS, MAX_BUFFER_DAYS]).toEqual([1, 5, 14]);
  });
});

describe("checkBufferDays", () => {
  it.each([
    ["", "Isi buffer deadline"],
    ["   ", "Isi buffer deadline"],
    ["2.5", "Isi angka bulat 1–14"],
    ["lima", "Isi angka bulat 1–14"],
    ["0", "Isi angka bulat 1–14"],
    ["15", "Isi angka bulat 1–14"],
  ])("refuses %j with %j, in the API's words", (typed, message) => {
    expect(checkBufferDays(typed)).toBe(message);
  });

  it.each(["1", "5", "14", " 7 "])("accepts %j", (typed) => {
    expect(checkBufferDays(typed)).toBeUndefined();
  });
});

describe("bufferChangeDetails", () => {
  it("lists the old and the new buffer for the confirmation", () => {
    expect(bufferChangeDetails(5, 7)).toEqual([["Buffer deadline", "5 hari → 7 hari"]]);
  });
});

describe("parseBufferDays", () => {
  it("reads the buffer the API sends", () => {
    expect(parseBufferDays({ bufferDays: 9 })).toBe(9);
  });

  it.each([null, "5", {}, { bufferDays: "5" }, { bufferDays: 0 }, { bufferDays: 15 }, { bufferDays: 2.5 }])(
    "falls back to the default for an answer it cannot trust: %j",
    (raw) => {
      expect(parseBufferDays(raw)).toBe(DEFAULT_BUFFER_DAYS);
    },
  );
});

describe("saveDeadlineBuffer", () => {
  it("puts the new buffer through the /api proxy and hands back what the API stored", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(200, { bufferDays: 7, min: 1, max: 14 }));
    vi.stubGlobal("fetch", fetch);

    await expect(saveDeadlineBuffer(7)).resolves.toEqual({ ok: true, bufferDays: 7 });

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/deadline-buffer");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ bufferDays: 7 });
  });

  it("hands back the API's field message from a 422", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        json(422, {
          message: "Data buffer deadline tidak valid",
          errors: { bufferDays: "Isi angka bulat 1–14" },
        }),
      ),
    );

    await expect(saveDeadlineBuffer(20)).resolves.toEqual({
      ok: false,
      status: 422,
      message: "Data buffer deadline tidak valid",
      fieldError: "Isi angka bulat 1–14",
    });
  });

  it("says only a Super Admin may change it on a 403", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(403, {})));

    await expect(saveDeadlineBuffer(7)).resolves.toEqual({
      ok: false,
      status: 403,
      message: "Hanya Super Admin yang bisa mengubah buffer deadline.",
    });
  });

  it("keeps a 5xx body's wording out of the form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(500, { message: "relation does not exist" })),
    );

    await expect(saveDeadlineBuffer(7)).resolves.toEqual({
      ok: false,
      status: 500,
      message: "Buffer deadline gagal disimpan. Coba lagi.",
    });
  });

  it("answers a request that never reached the API instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError("offline")));

    await expect(saveDeadlineBuffer(7)).resolves.toEqual({
      ok: false,
      status: 0,
      message: "Buffer deadline gagal disimpan. Coba lagi.",
    });
  });
});
