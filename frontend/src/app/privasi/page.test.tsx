import { render, screen } from "@testing-library/react";
import PrivacyPage, { metadata } from "./page";
import { MIN_TARGET } from "@/components/ui/touch-target";

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

  it("names Google Cloud as the only place the data is stored", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByText(/Data disimpan di layanan cloud yang digunakan Tofly \(Google Cloud\)\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Supabase/)).not.toBeInTheDocument();
  });

  it("links back to the login page", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("link", { name: "Kembali ke halaman masuk" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  // On its own line it is no link inside a sentence, so WCAG 2.5.8's 24px applies; it was 17px.
  it("gives the way back at least a 24px press", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("link", { name: "Kembali ke halaman masuk" })).toHaveClass(MIN_TARGET);
  });
});
