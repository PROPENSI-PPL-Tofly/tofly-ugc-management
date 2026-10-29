import { render, screen, within } from "@testing-library/react";
import { ConnectedAccountsError, type ConnectedAccount } from "@/lib/connected-accounts";
import { fetchMyConnectedAccounts } from "@/lib/connected-accounts.server";
import CreatorPerformancePage from "./page";

vi.mock("@/lib/connected-accounts.server", () => ({ fetchMyConnectedAccounts: vi.fn() }));
vi.mock("@/lib/connected-account-actions.server", () => ({ disconnectAccount: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/creator/performance",
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

const mockedFetch = vi.mocked(fetchMyConnectedAccounts);

const ACCOUNTS: ConnectedAccount[] = [
  { platform: "instagram", connected: false, username: null, connectedAt: null },
  { platform: "tiktok", connected: true, username: "satrialeka", connectedAt: "2026-10-29T17:06:15.305Z" },
];

async function renderPage(params: Record<string, string | string[] | undefined> = {}) {
  return render(<>{await CreatorPerformancePage({ searchParams: Promise.resolve(params) })}</>);
}

describe("Creator Performa page", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it("opens in the creator frame under the Performa title, as the prototype names it", async () => {
    mockedFetch.mockResolvedValue(ACCOUNTS);

    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Performa" })).toBeInTheDocument();
    expect(screen.getByText("Data performa konten kamu")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Menu creator" })).toBeInTheDocument();
  });

  it("shows the creator's accounts in the Akun Terhubung panel", async () => {
    mockedFetch.mockResolvedValue(ACCOUNTS);

    await renderPage();

    expect(screen.getByRole("heading", { name: "Akun Terhubung" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "TikTok" })).getByText(/@satrialeka/)).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Instagram" })).getByText("Belum terhubung")).toBeInTheDocument();
  });

  it("reads the result a connect landed back with", async () => {
    mockedFetch.mockResolvedValue(ACCOUNTS);

    await renderPage({ connected: "tiktok" });

    expect(screen.getByRole("status")).toHaveTextContent("Akun TikTok berhasil terhubung");
  });

  it("asks a creator whose session ended to sign in again", async () => {
    mockedFetch.mockRejectedValue(new ConnectedAccountsError(401));

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Sesi kamu sudah berakhir.");
    expect(screen.getByRole("link", { name: "Masuk" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("heading", { name: "Akun Terhubung" })).not.toBeInTheDocument();
  });

  // Never an empty panel that would claim nothing is connected.
  it.each([
    ["a backend that failed", new ConnectedAccountsError(500)],
    ["a backend that cannot be reached", new TypeError("fetch failed")],
  ])("says the accounts could not be loaded after %s, with a way to try again", async (_label, failure) => {
    mockedFetch.mockRejectedValue(failure);

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Akun terhubung tidak bisa dimuat.");
    expect(screen.getByRole("link", { name: "Muat ulang" })).toHaveAttribute("href", "/creator/performance");
    expect(screen.queryByRole("heading", { name: "Akun Terhubung" })).not.toBeInTheDocument();
  });
});
