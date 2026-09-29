import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { currentRole } from "@/lib/session.server";
import LoginPage, { metadata } from "./page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/session.server", () => ({ currentRole: vi.fn() }));

async function renderLogin(params: Record<string, string | string[] | undefined> = {}) {
  render(await LoginPage({ searchParams: Promise.resolve(params) }));
}

describe("Login page", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
    vi.mocked(currentRole).mockResolvedValue(null);
  });

  // "Tofly" alone reads like the company's public site; the product name says which Tofly this is.
  it("names the product in full and explains who can sign in", async () => {
    await renderLogin();

    expect(metadata.title).toBe("Masuk — Tofly Creator Management System");
    expect(screen.getByText("Tofly Creator Management System")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Masuk" })).toBeInTheDocument();
    expect(
      screen.getByText("Gunakan akun Google yang sudah didaftarkan oleh Admin."),
    ).toBeInTheDocument();
  });

  it("starts Google sign-in with a full-page navigation to the backend flow", async () => {
    await renderLogin();

    const button = screen.getByRole("link", { name: "Masuk dengan Google" });
    // A plain anchor, not next/link: prefetching this URL would start a sign-in on its own.
    expect(button).toHaveAttribute("href", "/api/auth/google");
    expect(button.tagName).toBe("A");
    expect(button).not.toHaveAttribute("target");
  });

  it("hides the Google mark from assistive technology", async () => {
    await renderLogin();

    const mark = screen.getByRole("link", { name: "Masuk dengan Google" }).querySelector("svg");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveAttribute("focusable", "false");
  });

  it("links to the privacy policy Google shows on its consent screen", async () => {
    await renderLogin();

    expect(screen.getByRole("link", { name: "Kebijakan Privasi" })).toHaveAttribute(
      "href",
      "/privasi",
    );
  });

  it("shows no alert on a normal visit", async () => {
    await renderLogin();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["sign_in_failed", "Gagal masuk dengan Google. Silakan coba lagi."],
    ["cancelled", "Masuk dibatalkan. Pilih akun Google Anda untuk melanjutkan."],
  ])("announces why the last attempt (%s) came back here", async (error, message) => {
    await renderLogin({ error });

    expect(screen.getByRole("alert")).toHaveTextContent(message);
  });

  describe("a refused email (not_authorized)", () => {
    it("says the email has no access and points to the Admin", async () => {
      await renderLogin({ error: "not_authorized" });

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Email ini tidak punya akses ke Tofly.");
      expect(alert).toHaveTextContent("Hubungi Admin untuk meminta akses");
      expect(alert).not.toHaveTextContent("Gagal masuk dengan Google");
    });

    it("keeps the Google button so another account can be picked", async () => {
      await renderLogin({ error: "not_authorized" });

      expect(screen.getByRole("link", { name: "Masuk dengan Google" })).toHaveAttribute(
        "href",
        "/api/auth/google",
      );
    });

    // The page is told why, never who: an email in the link would sit in browser history and
    // server logs, and anything written there could be made to read as the app's own words.
    it("never shows an email or other text carried in the link", async () => {
      await renderLogin({ error: "not_authorized", email: "orang@luar.com", message: "Hubungi 0812" });

      expect(document.body).not.toHaveTextContent("orang@luar.com");
      expect(document.body).not.toHaveTextContent("0812");
    });
  });

  it("never echoes an unknown error code", async () => {
    await renderLogin({ error: "<b>pwned</b>" });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("pwned");
  });

  // A repeated ?error= arrives as a list; the page must not pick one or print them, so a change
  // to how it reads searchParams cannot slip a crafted value past the helper.
  it.each([
    ["two known codes", ["not_authorized", "not_authorized"]],
    ["a known code followed by crafted text", ["not_authorized", "Hubungi 0812"]],
  ])("shows no alert for a repeated error parameter (%s)", async (_label, error) => {
    await renderLogin({ error });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("0812");
  });

  it.each([
    ["an admin", "admin", "/admin/creators"],
    ["a creator", "creator", "/creator/tasks"],
  ] as const)("sends %s who is already signed in to their own page", async (_label, role, path) => {
    vi.mocked(currentRole).mockResolvedValue(role);

    await LoginPage({ searchParams: Promise.resolve({}) });

    expect(redirect).toHaveBeenCalledWith(path);
  });

  it("still offers sign-in when the session cannot be checked", async () => {
    vi.mocked(currentRole).mockRejectedValue(new Error("backend down"));

    await renderLogin();

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Masuk dengan Google" })).toBeInTheDocument();
  });

  it("says the session ended when an action was refused for it", async () => {
    await renderLogin({ error: "session_expired" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sesi Anda sudah berakhir. Silakan masuk lagi untuk melanjutkan.",
    );
  });
});
