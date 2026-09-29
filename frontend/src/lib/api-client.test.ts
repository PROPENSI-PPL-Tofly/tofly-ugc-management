import { apiFetch, SESSION_EXPIRED_LOGIN } from "./api-client";

describe("apiFetch", () => {
  const assign = vi.fn();

  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
    vi.stubGlobal("location", { ...window.location, assign });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    assign.mockReset();
  });

  it("passes the request through and hands back any answer that is not 401", async () => {
    const answer = new Response("{}", { status: 422 });
    vi.mocked(globalThis.fetch).mockResolvedValue(answer);

    const response = await apiFetch("/api/creators", { method: "POST" });

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/creators", { method: "POST" });
    expect(response).toBe(answer);
    expect(assign).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor straight to the login page, saying the session ended", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("{}", { status: 401 }));

    // Never settles: the page is on its way out, so the form keeps its busy state rather than
    // flashing an error that would be gone a moment later.
    const outcome = await Promise.race([
      apiFetch("/api/contents", { method: "POST" }).then(() => "settled"),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 20)),
    ]);

    expect(outcome).toBe("pending");
    expect(assign).toHaveBeenCalledWith(SESSION_EXPIRED_LOGIN);
    expect(SESSION_EXPIRED_LOGIN).toBe("/login?error=session_expired");
  });

  it("lets a network failure reach the caller, who owns that message", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(apiFetch("/api/creators")).rejects.toThrow("Failed to fetch");
    expect(assign).not.toHaveBeenCalled();
  });
});
