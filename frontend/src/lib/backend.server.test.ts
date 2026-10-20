const { sessionCookies, incoming } = vi.hoisted(() => ({
  sessionCookies: [] as { name: string; value: string }[],
  // The headers the browser sent with the server action's own POST.
  incoming: { current: {} as Record<string, string> },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => sessionCookies })),
  headers: vi.fn(async () => new Headers(incoming.current)),
}));

import { backendPostForm } from "./backend.server";

const PATH = "/invoices/11111111-1111-4111-8111-111111111111/payment-proof";

function proofForm(): FormData {
  const form = new FormData();
  form.set("file", new File(["%PDF-1.7"], "bukti.pdf", { type: "application/pdf" }));
  return form;
}

describe("backendPostForm", () => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_URL", "http://localhost:3001");
    sessionCookies.push({ name: "__session", value: "abc" });
    incoming.current = { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 201 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    sessionCookies.length = 0;
    incoming.current = {};
  });

  it("posts the form to the backend path, never from a cache", async () => {
    const form = proofForm();

    await backendPostForm(PATH, form);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://localhost:3001${PATH}`,
      expect.objectContaining({ method: "POST", cache: "no-store", body: form }),
    );
  });

  it("carries the browser's session and its origin headers, as the JSON post does", async () => {
    await backendPostForm(PATH, proofForm());

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(init?.headers).toEqual({
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      cookie: "__session=abc",
    });
  });

  it("leaves the content type to fetch, so the multipart boundary is its own", async () => {
    await backendPostForm(PATH, proofForm());

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(Object.keys(init?.headers ?? {})).not.toContain("content-type");
  });

  it("joins a backend address that ends in a slash without doubling it", async () => {
    vi.stubEnv("BACKEND_URL", "http://localhost:3001/");

    await backendPostForm(PATH, proofForm());

    expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe(`http://localhost:3001${PATH}`);
  });

  it("refuses to send anything when the backend address is not configured", async () => {
    vi.stubEnv("BACKEND_URL", "");

    await expect(backendPostForm(PATH, proofForm())).rejects.toThrow("BACKEND_URL is not configured");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
