import { fetchMyTasks, formatDeadlineDistance, isHttpUrl, parseTaskPage, submitDraft } from "./tasks";

describe("parseTaskPage", () => {
  it("starts on the first page", () => {
    expect(parseTaskPage({})).toBe(1);
  });

  it("reads the page out of the URL", () => {
    expect(parseTaskPage({ page: "3" })).toBe(3);
    expect(parseTaskPage({ page: ["2", "9"] })).toBe(2);
  });

  it("ignores a page that is not a positive whole number", () => {
    expect(parseTaskPage({ page: "0" })).toBe(1);
    expect(parseTaskPage({ page: "abc" })).toBe(1);
    expect(parseTaskPage({ page: [] })).toBe(1);
  });
});

describe("formatDeadlineDistance", () => {
  it("counts down in H-n", () => {
    expect(formatDeadlineDistance(3)).toBe("H-3");
    expect(formatDeadlineDistance(1)).toBe("H-1");
  });

  it("calls out the day itself and a missed deadline", () => {
    expect(formatDeadlineDistance(0)).toBe("Hari ini");
    expect(formatDeadlineDistance(-2)).toBe("Lewat 2 hari");
  });
});

describe("fetchMyTasks", () => {
  const body = { items: [], page: 1, pageSize: 5, total: 0, totalPages: 1 };

  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001/");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("asks the backend for five tasks on the first page", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

    await expect(fetchMyTasks(1)).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith("http://backend:3001/me/contents?pageSize=5", {
      cache: "no-store",
    });
  });

  it("names later pages", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

    await fetchMyTasks(3);

    expect(fetchMock.mock.calls[0][0]).toBe("http://backend:3001/me/contents?pageSize=5&page=3");
  });

  it("fails with the status when the backend refuses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 401 }));

    await expect(fetchMyTasks(1)).rejects.toThrow("HTTP 401");
  });

  it("fails clearly without a backend address", async () => {
    vi.stubEnv("BACKEND_URL", "");

    await expect(fetchMyTasks(1)).rejects.toThrow("BACKEND_URL is not configured");
  });
});

describe("isHttpUrl", () => {
  it.each(["https://drive.google.com/file/d/abc", "http://example.com/x", "  https://a.co  "])(
    "accepts %s",
    (value) => {
      expect(isHttpUrl(value)).toBe(true);
    },
  );

  it.each(["", "drive.google.com/abc", "ftp://files.example.com/a", "javascript:alert(1)", "https://localhost"])(
    "rejects %s",
    (value) => {
      expect(isHttpUrl(value)).toBe(false);
    },
  );
});

describe("submitDraft", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the trimmed link and note through the proxy and returns the updated task", async () => {
    const updated = { id: "content-1", status: "draft_review" };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(updated), { status: 201 }));

    await expect(
      submitDraft("content 1", { link: " https://drive.google.com/a ", creatorNotes: " Catatan " }),
    ).resolves.toEqual(updated);

    expect(fetchMock).toHaveBeenCalledWith("/api/contents/content%201/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link: "https://drive.google.com/a", creatorNotes: "Catatan" }),
    });
  });

  it("leaves a blank note out entirely", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 201 }));

    await submitDraft("c", { link: "https://a.co", creatorNotes: "   " });

    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({ link: "https://a.co" }));
  });

  it("surfaces the backend's own message on a refusal", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "DRAFT_NOT_ALLOWED", message: "Tidak bisa" }), {
        status: 409,
      }),
    );

    await expect(submitDraft("c", { link: "https://a.co", creatorNotes: "" })).rejects.toMatchObject({
      name: "SubmitError",
      message: "Tidak bisa",
      status: 409,
    });
  });

  it("falls back to a generic message for validation lists and unreadable bodies", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: ["link must be a URL address"] }), { status: 400 }))
      .mockResolvedValueOnce(new Response("<html>", { status: 502 }));

    await expect(submitDraft("c", { link: "x", creatorNotes: "" })).rejects.toThrow("Gagal mengirim");
    await expect(submitDraft("c", { link: "x", creatorNotes: "" })).rejects.toThrow("Gagal mengirim");
  });

  it("turns a network failure into the same friendly message", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(submitDraft("c", { link: "https://a.co", creatorNotes: "" })).rejects.toMatchObject({
      message: "Gagal mengirim. Coba lagi sebentar lagi.",
      status: 0,
    });
  });
});
