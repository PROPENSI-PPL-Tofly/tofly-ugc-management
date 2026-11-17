import { render, screen, within } from "@testing-library/react";
import { ConnectedAccountsError, type ConnectedAccount } from "@/lib/connected-accounts";
import { fetchMyConnectedAccounts } from "@/lib/connected-accounts.server";
import {
  PerformanceLinksError,
  type PerformanceLinksPage,
} from "@/lib/performance-links";
import { fetchMyPerformanceLinks } from "@/lib/performance-links.server";
import CreatorPerformancePage from "./page";

vi.mock("@/lib/connected-accounts.server", () => ({ fetchMyConnectedAccounts: vi.fn() }));
vi.mock("@/lib/connected-account-actions.server", () => ({ disconnectAccount: vi.fn() }));
vi.mock("@/lib/performance-links.server", () => ({ fetchMyPerformanceLinks: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/creator/performance",
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: false }) };
});

const mockedFetch = vi.mocked(fetchMyConnectedAccounts);
const mockedLinks = vi.mocked(fetchMyPerformanceLinks);

const EMPTY_LINKS: PerformanceLinksPage = {
  items: [],
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 0,
};

/** One page of the API's rows, real-shaped: three pages' worth of links, ten a page. */
function answered(): PerformanceLinksPage {
  return {
    items: [
      {
        linkId: "33333333-3333-4333-8333-333333333333",
        contentId: "44444444-4444-4444-8444-444444444444",
        contentName: "Evg_1_RanggaPratama_12102026",
        creatorId: "11111111-1111-4111-8111-111111111111",
        creatorName: "Rangga Pratama",
        platform: "instagram",
        url: "https://instagram.com/p/x",
        views: 12400,
        likes: 900,
        comments: null,
        shares: null,
        state: "not_connected",
        lastSyncedAt: null,
        manualAt: null,
      },
    ],
    page: 1,
    pageSize: 10,
    total: 21,
    totalPages: 3,
  };
}

const ACCOUNTS: ConnectedAccount[] = [
  { platform: "instagram", hasAccount: true, connected: false, username: null, connectedAt: null, lastSyncAt: null },
  {
    platform: "tiktok",
    hasAccount: true,
    connected: true,
    username: "satrialeka",
    connectedAt: "2026-10-29T17:06:15.305Z",
    lastSyncAt: null,
  },
];

async function renderPage(params: Record<string, string | string[] | undefined> = {}) {
  return render(<>{await CreatorPerformancePage({ searchParams: Promise.resolve(params) })}</>);
}

describe("Creator Performa page", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedLinks.mockReset();
    mockedLinks.mockResolvedValue(EMPTY_LINKS);
  });

  it("opens in the creator frame under the Performa title, as the prototype names it", async () => {
    mockedFetch.mockResolvedValue(ACCOUNTS);

    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Performa Konten" })).toBeInTheDocument();
    // No subtitle under the page title.
    expect(screen.queryByText("Data performa konten kamu")).not.toBeInTheDocument();
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

// The note that the numbers lock at Finalize is gone from the page: it is not said anywhere.
describe("the lock reminder", () => {
  it("is not on the page", async () => {
    mockedFetch.mockReset();
    mockedLinks.mockReset();
    mockedFetch.mockResolvedValue(ACCOUNTS);
    mockedLinks.mockResolvedValue(EMPTY_LINKS);

    await renderPage();

    expect(screen.queryByText(/dikunci saat invoice difinalisasi/)).toBeNull();
  });
});

describe("the creator's link list (PBI-27, 27.6)", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedLinks.mockReset();
    mockedLinks.mockResolvedValue(EMPTY_LINKS);
  });

  it("lists the creator's links under Akun Terhubung, read-only (AC 20)", async () => {
    mockedFetch.mockResolvedValue(ACCOUNTS);
    mockedLinks.mockResolvedValue(answered());

    await renderPage();

    const panel = screen.getByRole("heading", { name: "Akun Terhubung" });
    const table = screen.getByRole("table");
    expect(panel.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(table).getByText("12.400")).toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: /Sinkronkan/ })).not.toBeInTheDocument();
  });

  it("opens a link's content in Tugas Saya's Detail Konten from its name", async () => {
    mockedFetch.mockResolvedValue(ACCOUNTS);
    mockedLinks.mockResolvedValue(answered());

    await renderPage();

    const name = screen.getByRole("link", { name: "Evg_1_RanggaPratama_12102026" });
    expect(name).toHaveAttribute("href", "/creator/tasks?content=44444444-4444-4444-8444-444444444444");
    expect(name).not.toHaveClass("underline");
  });

  // The page holds two things, the accounts and the links, so the links say which they are.
  it("titles the links Performa Konten above their panel, with no title band in it", async () => {
    mockedFetch.mockResolvedValue(ACCOUNTS);
    mockedLinks.mockResolvedValue(answered());

    await renderPage();

    const links = screen.getByRole("region", { name: "Performa Konten" });
    const title = within(links).getByRole("heading", { level: 2, name: "Performa Konten" });
    expect(links.querySelector("[data-tone]")).toBeNull();
    // Above the panel the table sits in, so it names the whole section.
    expect(title.compareDocumentPosition(within(links).getByRole("table"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("filters the links by platform and Status Data, with no Creator filter of its own", async () => {
    mockedFetch.mockResolvedValue(ACCOUNTS);
    mockedLinks.mockResolvedValue(answered());

    await renderPage();

    const links = screen.getByRole("region", { name: "Performa Konten" });
    expect(within(links).getByRole("button", { name: /^Status Data:/ })).toBeInTheDocument();
    expect(within(links).getByRole("button", { name: /^Platform:/ })).toBeInTheDocument();
    expect(within(links).queryByRole("button", { name: /^Creator:/ })).toBeNull();
  });

  it("asks for the page, the platforms and the states the address names", async () => {
    mockedFetch.mockResolvedValue(ACCOUNTS);
    mockedLinks.mockResolvedValue(answered());

    await renderPage({ state: "synced,manual", platform: "tiktok", page: "2" });

    expect(mockedLinks).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, platform: ["tiktok"], dataState: ["synced", "manual"] }),
    );
  });

  it("says no link matches when a filter empties the list, rather than that nothing was sent", async () => {
    mockedFetch.mockResolvedValue(ACCOUNTS);
    mockedLinks.mockResolvedValue(EMPTY_LINKS);

    await renderPage({ state: "manual" });

    expect(screen.getByText("Tidak ada link yang cocok dengan filter")).toBeInTheDocument();
    expect(screen.queryByText("Belum ada konten yang dikirim")).toBeNull();
  });

  it("shows ten rows a page with a pagination", async () => {
    mockedFetch.mockResolvedValue(ACCOUNTS);
    mockedLinks.mockResolvedValue(answered());

    await renderPage();

    expect(screen.getByText(/Menampilkan 1/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Berikutnya" })).toHaveLength(1);
  });

  it("says no content has been sent when the list holds nothing (AC 20)", async () => {
    mockedFetch.mockResolvedValue(ACCOUNTS);

    await renderPage();

    expect(screen.getByText("Belum ada konten yang dikirim")).toBeInTheDocument();
  });

  it("says the link list could not be loaded, without taking the accounts panel with it", async () => {
    mockedFetch.mockResolvedValue(ACCOUNTS);
    mockedLinks.mockRejectedValue(new PerformanceLinksError(502));

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Daftar link tidak bisa dimuat.");
    expect(screen.getByRole("heading", { name: "Akun Terhubung" })).toBeInTheDocument();
  });

  it("prompts to connect an account that is not connected (AC 20)", async () => {
    mockedFetch.mockResolvedValue(ACCOUNTS);
    mockedLinks.mockResolvedValue(answered());

    await renderPage();

    expect(screen.getByRole("link", { name: "Hubungkan" })).toHaveAttribute(
      "href",
      "/api/social/instagram/connect",
    );
  });
});
