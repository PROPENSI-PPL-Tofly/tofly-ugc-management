import { render, screen } from "@testing-library/react";
import LoginPage, { metadata } from "./page";

async function renderLogin(params: Record<string, string | string[] | undefined> = {}) {
  render(await LoginPage({ searchParams: Promise.resolve(params) }));
}

describe("Login page", () => {
  it("names the page and explains who can sign in", async () => {
    await renderLogin();

    expect(metadata.title).toBe("Masuk — Tofly");
    expect(screen.getByRole("heading", { level: 1, name: "Masuk ke Tofly" })).toBeInTheDocument();
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

  it("never echoes an unknown error code", async () => {
    await renderLogin({ error: "<b>pwned</b>" });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("pwned");
  });
});
