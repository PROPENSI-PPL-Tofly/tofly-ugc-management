// @vitest-environment node
// The route runs on the Next server, not in a browser, and needs the real
// Request/Response globals rather than jsdom's.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "./route";

const params = (...path: string[]) => ({ params: Promise.resolve({ path }) });

describe("/api/* proxy", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("forwards to the backend, preserving path and query string", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response('{"db":"ok"}', { status: 200 }));

    const response = await GET(
      new Request("http://localhost:3000/api/health?verbose=1"),
      params("health"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ db: "ok" });

    const [target] = fetchMock.mock.calls[0];
    expect(String(target)).toBe("http://backend:3001/health?verbose=1");
  });

  it("keeps a trailing slash on BACKEND_URL from swallowing the path", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:3001/");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await GET(new Request("http://localhost:3000/api/posts/42"), params("posts", "42"));

    expect(String(fetchMock.mock.calls[0][0])).toBe("http://backend:3001/posts/42");
  });

  it("passes the method and body through", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response('{"id":1}', { status: 201 }));

    const response = await POST(
      new Request("http://localhost:3000/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"title":"hi"}',
      }),
      params("posts"),
    );

    expect(response.status).toBe(201);

    const init = fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe("POST");
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"title":"hi"}');
    expect((init.headers as Headers).get("content-type")).toBe("application/json");
    // Hop-by-hop headers describe the inbound connection only.
    expect((init.headers as Headers).has("host")).toBe(false);
  });

  it("sends no body on GET, which fetch would reject", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response('{"db":"ok"}', { status: 200 }));

    await GET(new Request("http://localhost:3000/api/health"), params("health"));

    expect(fetchMock.mock.calls[0][1]!.body).toBeUndefined();
  });

  it("forwards the method on a delete", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    const response = await DELETE(
      new Request("http://localhost:3000/api/posts/42", { method: "DELETE" }),
      params("posts", "42"),
    );

    expect(response.status).toBe(204);
    expect(fetchMock.mock.calls[0][1]!.method).toBe("DELETE");
  });

  it("preserves every Set-Cookie the backend sends", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: [
          ["set-cookie", "session=abc; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT"],
          ["set-cookie", "refresh=xyz; Path=/; HttpOnly"],
        ],
      }),
    );

    const response = await GET(new Request("http://localhost:3000/api/login"), params("login"));

    // Both survive: a login that sets a session and a refresh token must not
    // silently lose one of them.
    expect(response.headers.getSetCookie()).toEqual([
      "session=abc; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT",
      "refresh=xyz; Path=/; HttpOnly",
    ]);
  });

  it("returns 502 when the upstream fetch throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const response = await GET(new Request("http://localhost:3000/api/health"), params("health"));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: "Bad gateway",
      detail: "ECONNREFUSED",
    });
  });

  it("returns 502 when BACKEND_URL is not configured", async () => {
    vi.stubEnv("BACKEND_URL", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await GET(new Request("http://localhost:3000/api/health"), params("health"));

    expect(response.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
