import { cookies } from "next/headers";
import { appSessionCookieHeader } from "./session-cookie";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

function browserSends(...jar: { name: string; value: string }[]) {
  vi.mocked(cookies).mockResolvedValueOnce({
    getAll: () => jar,
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

describe("appSessionCookieHeader", () => {
  it("forwards the __session cookie and nothing else", async () => {
    browserSends(
      { name: "theme", value: "dark" },
      { name: "__session", value: "opaque-session-id" },
    );

    await expect(appSessionCookieHeader()).resolves.toBe(
      "__session=opaque-session-id",
    );
  });

  it("forwards nothing when the browser has no session cookie", async () => {
    browserSends({ name: "__Host-tofly_session", value: "retired-name" });

    await expect(appSessionCookieHeader()).resolves.toBeUndefined();
  });
});
