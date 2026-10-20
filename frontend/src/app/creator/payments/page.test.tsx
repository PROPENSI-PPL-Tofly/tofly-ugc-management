import { render, screen } from "@testing-library/react";
import { CreatorInvoicesError } from "@/lib/creator-invoice";
import { aCreatorInvoice } from "@/lib/creator-invoice.builder";
import { fetchMyInvoices } from "@/lib/creator-invoice.server";
import CreatorPaymentsPage from "./page";

vi.mock("@/lib/creator-invoice.server", () => ({
  fetchMyInvoices: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/creator/payments",
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

const mockedFetch = vi.mocked(fetchMyInvoices);

async function renderPage() {
  return render(<>{await CreatorPaymentsPage()}</>);
}

describe("Creator payments page", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it("opens in the creator frame under the Pembayaran title, as the prototype names it", async () => {
    mockedFetch.mockResolvedValue([]);

    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Pembayaran" })).toBeInTheDocument();
    expect(screen.getByText("Invoice kamu per periode kontrak")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Menu creator" })).toBeInTheDocument();
  });

  it("shows the creator's invoices", async () => {
    mockedFetch.mockResolvedValue([aCreatorInvoice({ totalAmount: 550000 })]);

    await renderPage();

    expect(screen.getByRole("group", { name: "Ringkasan invoice" })).toHaveTextContent("Rp550.000");
  });

  it("says a failed load failed, with a way to try again, rather than claiming there is no invoice", async () => {
    mockedFetch.mockRejectedValue(new CreatorInvoicesError(500));

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Invoice tidak bisa dimuat.");
    expect(screen.getByRole("link", { name: "Muat ulang" })).toHaveAttribute("href", "/creator/payments");
    expect(screen.queryByText("Belum ada invoice.")).not.toBeInTheDocument();
  });

  it("treats any other failure as a failed load too", async () => {
    mockedFetch.mockRejectedValue(new Error("BACKEND_URL is not configured"));

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Invoice tidak bisa dimuat.");
  });

  it("asks a creator whose session ended to sign in again", async () => {
    mockedFetch.mockRejectedValue(new CreatorInvoicesError(401));

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Sesi kamu sudah berakhir.");
    expect(screen.getByRole("link", { name: "Masuk" })).toHaveAttribute("href", "/login");
  });
});
