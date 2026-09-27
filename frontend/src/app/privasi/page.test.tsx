import { render, screen } from "@testing-library/react";
import PrivacyPage, { metadata } from "./page";

describe("Privacy page", () => {
  it("is titled as Tofly's privacy policy", () => {
    render(<PrivacyPage />);

    expect(metadata.title).toBe("Kebijakan Privasi — Tofly");
    expect(
      screen.getByRole("heading", { level: 1, name: "Kebijakan Privasi Tofly" }),
    ).toBeInTheDocument();
  });

  it("covers what Google shares, what the data is for, cookies, who sees what, and how to get help", () => {
    render(<PrivacyPage />);

    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Data dari akun Google",
      "Data yang dikelola Admin",
      "Cookie",
      "Siapa yang dapat melihat data",
      "Pertanyaan dan penghapusan data",
    ]);
  });

  it("states that only the email is requested from Google, never a password", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/hanya meminta alamat email/)).toBeInTheDocument();
    expect(screen.getByText(/tidak pernah menerima kata sandi/)).toBeInTheDocument();
  });

  it("links back to the login page", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("link", { name: "Kembali ke halaman masuk" })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
