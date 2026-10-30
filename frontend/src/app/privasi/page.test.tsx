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
      "Data performa dari Instagram dan TikTok",
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
});

// PBI-19, AC 15: what Tofly pulls from a connected Instagram or TikTok, why, how long it is kept
// and how to disconnect, in the words of the creator's own Kebijakan Privasi pop-up (19.4).
describe("Privacy page, performance data", () => {
  function section() {
    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Data performa dari Instagram dan TikTok",
    });
    // The section's paragraphs run until the next heading.
    const paragraphs: string[] = [];
    for (let node = heading.nextElementSibling; node && node.tagName !== "H2"; ) {
      paragraphs.push(node.textContent ?? "");
      node = node.nextElementSibling;
    }
    return paragraphs.join(" ");
  }

  it("says what is pulled: the username and the numbers of the creator's own content", () => {
    render(<PrivacyPage />);

    expect(section()).toMatch(/username/);
    expect(section()).toMatch(/views, likes, comments, shares/);
    expect(section()).toMatch(/konten yang Anda buat sendiri/);
  });

  it("says why: to show the creator's performance and work out the performance bonus", () => {
    render(<PrivacyPage />);

    expect(section()).toMatch(/bonus performa di invoice/);
  });

  it("says how long: access only while connected, saved numbers kept with the invoice", () => {
    render(<PrivacyPage />);

    expect(section()).toMatch(/selama akun masih terhubung/);
    expect(section()).toMatch(/dihapus saat Anda menekan Putuskan/);
    expect(section()).toMatch(/catatan invoice/);
  });

  it("says how to disconnect, from the Performa page", () => {
    render(<PrivacyPage />);

    expect(section()).toMatch(/halaman Performa/);
    expect(section()).toMatch(/tekan Putuskan/);
  });

  it("promises no retention period the product has not set", () => {
    render(<PrivacyPage />);

    expect(section()).not.toMatch(/\d+\s*(hari|bulan|tahun)/);
  });

  it("comes right after the data Admin manages, before cookies", () => {
    render(<PrivacyPage />);

    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles.indexOf("Data performa dari Instagram dan TikTok")).toBe(
      titles.indexOf("Data yang dikelola Admin") + 1,
    );
  });
});
