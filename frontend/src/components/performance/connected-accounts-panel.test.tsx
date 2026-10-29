import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { disconnectAccount, type DisconnectOutcome } from "@/lib/connected-account-actions.server";
import { DISCONNECT_REFUSALS, type ConnectedAccount, type ConnectOutcome } from "@/lib/connected-accounts";
import { ConnectedAccountsPanel } from "./connected-accounts-panel";

const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/lib/connected-account-actions.server", () => ({ disconnectAccount: vi.fn() }));

const NOT_CONNECTED: ConnectedAccount[] = [
  { platform: "instagram", connected: false, username: "rangga.creates", connectedAt: null },
  { platform: "tiktok", connected: false, username: null, connectedAt: null },
];

const TIKTOK_CONNECTED: ConnectedAccount[] = [
  NOT_CONNECTED[0],
  { platform: "tiktok", connected: true, username: "satrialeka", connectedAt: "2026-10-29T17:06:15.305Z" },
];

function row(platform: "Instagram" | "TikTok"): HTMLElement {
  return screen.getByRole("group", { name: platform });
}

function renderPanel(
  props: Partial<{
    accounts: ConnectedAccount[];
    outcome: ConnectOutcome | null;
    disconnect: (platform: unknown) => Promise<DisconnectOutcome>;
  }> = {},
) {
  return render(<ConnectedAccountsPanel accounts={NOT_CONNECTED} outcome={null} {...props} />);
}

// "Hubungkan" is a real link to the backend; jsdom cannot navigate, so the test stops the
// browser's default once the panel has seen the click.
function stopNavigation(event: Event) {
  if (event.target instanceof Element && event.target.closest("a")) event.preventDefault();
}

describe("ConnectedAccountsPanel", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
    vi.mocked(disconnectAccount).mockReset();
    document.addEventListener("click", stopNavigation);
  });

  afterEach(() => {
    document.removeEventListener("click", stopNavigation);
  });

  it("is the Akun Terhubung panel, as the prototype titles it", () => {
    renderPanel();

    expect(screen.getByRole("heading", { name: "Akun Terhubung" })).toBeInTheDocument();
    expect(
      screen.getByText("Hubungkan akun media sosial untuk menarik data performa konten secara otomatis."),
    ).toBeInTheDocument();
  });

  it("has one Instagram row and one TikTok row, in that order", () => {
    renderPanel();

    expect(screen.getAllByRole("group").map((group) => group.getAttribute("aria-label"))).toEqual([
      "Instagram",
      "TikTok",
    ]);
  });

  describe("a row not connected yet", () => {
    it("says so and offers Hubungkan, which starts that platform's connect", () => {
      renderPanel();

      const instagram = within(row("Instagram"));
      expect(instagram.getByText("Belum terhubung")).toBeInTheDocument();
      const connect = instagram.getByRole("link", { name: "Hubungkan Instagram" });
      expect(connect).toHaveTextContent("Hubungkan");
      expect(connect).toHaveAttribute("href", "/api/social/instagram/connect");
      expect(instagram.queryByRole("button", { name: /Putuskan/ })).not.toBeInTheDocument();
    });

    // The prototype's connect button is the plain .btn (white with a grey border), not the
    // brand-blue primary: Hubungkan sits beside every row, so it must not shout.
    it("draws Hubungkan as the prototype's plain button, not the brand-blue one", () => {
      renderPanel();

      const connect = within(row("TikTok")).getByRole("link", { name: "Hubungkan TikTok" });
      expect(connect).toHaveClass("bg-surface", "border-rule");
      expect(connect).not.toHaveClass("bg-accent");
    });

    it("keeps the same plain look while it is on its way", () => {
      renderPanel();

      fireEvent.click(within(row("TikTok")).getByRole("link", { name: "Hubungkan TikTok" }));

      expect(within(row("TikTok")).getByRole("button", { name: "Menghubungkan…" })).not.toHaveClass("bg-accent");
    });

    // PRD 19.4: a loading state while the browser is on its way to the platform.
    it("shows it is on its way once pressed, and cannot be pressed twice", () => {
      renderPanel();

      fireEvent.click(within(row("TikTok")).getByRole("link", { name: "Hubungkan TikTok" }));

      const tiktok = within(row("TikTok"));
      expect(tiktok.queryByRole("link", { name: "Hubungkan TikTok" })).not.toBeInTheDocument();
      expect(tiktok.getByRole("button", { name: "Menghubungkan…" })).toBeDisabled();
      // The other platform stays as it was.
      expect(within(row("Instagram")).getByRole("link", { name: "Hubungkan Instagram" })).toBeInTheDocument();
    });
  });

  describe("a connected row", () => {
    it("shows Terhubung with the platform's username and the day it connected", () => {
      renderPanel({ accounts: TIKTOK_CONNECTED });

      const tiktok = within(row("TikTok"));
      expect(tiktok.getByText("Terhubung")).toBeInTheDocument();
      expect(tiktok.getByText("@satrialeka · Terhubung sejak 30 Okt 2026")).toBeInTheDocument();
      expect(tiktok.queryByRole("link", { name: /Hubungkan/ })).not.toBeInTheDocument();
      expect(tiktok.getByRole("button", { name: "Putuskan TikTok" })).toHaveTextContent("Putuskan");
    });

    // TikTok allows 24 characters and Instagram 30; the line is cut with an ellipsis, never
    // pushed past the card, and the whole handle stays in the page for a screen reader.
    it("cuts a long handle with an ellipsis instead of widening the card", () => {
      const handle = "a.very.long.instagram.handle.30";
      renderPanel({
        accounts: [{ platform: "instagram", connected: true, username: handle, connectedAt: null }, NOT_CONNECTED[1]],
      });

      const detail = within(row("Instagram")).getByText(`@${handle} · Terhubung`);
      expect(detail).toHaveClass("truncate");
    });

    it("leaves the handle out when the platform sent none", () => {
      renderPanel({
        accounts: [NOT_CONNECTED[0], { platform: "tiktok", connected: true, username: null, connectedAt: null }],
      });

      expect(within(row("TikTok")).getByText("Terhubung", { selector: "p" })).toBeInTheDocument();
      expect(within(row("TikTok")).queryByText(/@/)).not.toBeInTheDocument();
    });
  });

  describe("coming back from a connect", () => {
    it("toasts the success, as PRD 19 words it", () => {
      renderPanel({ accounts: TIKTOK_CONNECTED, outcome: { kind: "connected", platform: "tiktok" } });

      expect(screen.getByRole("status")).toHaveTextContent("Akun TikTok berhasil terhubung");
    });

    // A reload must not toast again or show a stale error.
    it("clears the result from the address once it has been read", () => {
      renderPanel({ outcome: { kind: "connected", platform: "tiktok" } });

      expect(replace).toHaveBeenCalledWith("/creator/performance", { scroll: false });
    });

    // React may render the same result again (a parent re-render, or Strict Mode running effects
    // twice); the toast and the address change still happen once.
    it("acts on a result once, however often it is rendered", () => {
      const outcome: ConnectOutcome = { kind: "connected", platform: "tiktok" };
      const { rerender } = renderPanel({ accounts: TIKTOK_CONNECTED, outcome });

      rerender(<ConnectedAccountsPanel accounts={TIKTOK_CONNECTED} outcome={outcome} />);
      rerender(<ConnectedAccountsPanel accounts={TIKTOK_CONNECTED} outcome={{ ...outcome }} />);

      expect(replace).toHaveBeenCalledTimes(1);
      expect(screen.getAllByRole("status")).toHaveLength(1);
    });

    it("leaves the address alone on a plain visit", () => {
      renderPanel();

      expect(replace).not.toHaveBeenCalled();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("shows a failure in that platform's row with Coba Lagi, which starts the connect again", () => {
      renderPanel({ outcome: { kind: "failed", platform: "instagram", error: "not_professional" } });

      const instagram = within(row("Instagram"));
      expect(instagram.getByRole("alert")).toHaveTextContent(
        "Akun Instagram harus akun Professional (Business atau Creator)",
      );
      expect(instagram.getByRole("link", { name: "Coba Lagi" })).toHaveAttribute(
        "href",
        "/api/social/instagram/connect",
      );
      expect(within(row("TikTok")).queryByRole("alert")).not.toBeInTheDocument();
      expect(replace).toHaveBeenCalledWith("/creator/performance", { scroll: false });
    });

    it("names the platform in trouble", () => {
      renderPanel({ outcome: { kind: "failed", platform: "tiktok", error: "platform_error" } });

      expect(within(row("TikTok")).getByRole("alert")).toHaveTextContent("TikTok sedang bermasalah. Coba lagi nanti.");
    });

    it("shows Coba Lagi on its way once pressed", () => {
      renderPanel({ outcome: { kind: "failed", platform: "tiktok", error: "cancelled" } });

      fireEvent.click(within(row("TikTok")).getByRole("link", { name: "Coba Lagi" }));

      expect(within(row("TikTok")).getByRole("button", { name: "Menghubungkan…" })).toBeDisabled();
    });

    it("keeps the failure on screen after the address is cleared", () => {
      const { rerender } = renderPanel({ outcome: { kind: "failed", platform: "tiktok", error: "cancelled" } });

      rerender(<ConnectedAccountsPanel accounts={NOT_CONNECTED} outcome={null} />);

      expect(within(row("TikTok")).getByRole("alert")).toHaveTextContent("Koneksi dibatalkan");
    });
  });

  // Found in the 390px screenshot: a row's actions ran off the card. Each card may shrink inside
  // the grid, its actions drop under the name when there is no room, and no button breaks its
  // label over two lines.
  describe("on a narrow screen", () => {
    it("lets each card shrink inside its column instead of pushing past the screen", () => {
      renderPanel();

      for (const platform of ["Instagram", "TikTok"] as const) {
        expect(row(platform)).toHaveClass("min-w-0");
      }
    });

    it("drops a row's actions under its name when they do not fit beside it", () => {
      renderPanel({ accounts: TIKTOK_CONNECTED });

      const actions = within(row("TikTok")).getByRole("button", { name: "Putuskan TikTok" }).parentElement;
      expect(actions?.parentElement).toHaveClass("flex-wrap");
    });

    it("drops Coba Lagi under a long message rather than squeezing either", () => {
      renderPanel({ outcome: { kind: "failed", platform: "instagram", error: "not_professional" } });

      expect(within(row("Instagram")).getByRole("alert")).toHaveClass("flex-wrap");
    });

    it.each([
      ["Hubungkan", () => within(row("TikTok")).getByRole("link", { name: "Hubungkan TikTok" })],
      ["Coba Lagi", () => within(row("Instagram")).getByRole("link", { name: "Coba Lagi" })],
    ])("keeps %s on one line", (_label, find) => {
      renderPanel({ outcome: { kind: "failed", platform: "instagram", error: "not_professional" } });

      expect(find()).toHaveClass("whitespace-nowrap");
    });

    it("keeps Putuskan on one line", () => {
      renderPanel({ accounts: TIKTOK_CONNECTED });

      expect(within(row("TikTok")).getByRole("button", { name: "Putuskan TikTok" })).toHaveClass("whitespace-nowrap");
    });
  });

  describe("Putuskan", () => {
    function openDialog() {
      fireEvent.click(within(row("TikTok")).getByRole("button", { name: "Putuskan TikTok" }));
      return screen.getByRole("alertdialog", { name: "Putuskan TikTok?" });
    }

    it("asks first, saying the numbers stay but stop updating", () => {
      const disconnect = vi.fn();
      renderPanel({ accounts: TIKTOK_CONNECTED, disconnect });

      const dialog = openDialog();

      expect(dialog).toHaveTextContent("Data performa yang sudah ada tetap disimpan, tapi tidak akan diperbarui lagi.");
      expect(disconnect).not.toHaveBeenCalled();
    });

    it("does nothing when the creator cancels", () => {
      const disconnect = vi.fn();
      renderPanel({ accounts: TIKTOK_CONNECTED, disconnect });

      fireEvent.click(within(openDialog()).getByRole("button", { name: "Batal" }));

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(disconnect).not.toHaveBeenCalled();
    });

    it("disconnects once confirmed, toasts it and reads the accounts again", async () => {
      const disconnect = vi.fn(async (): Promise<DisconnectOutcome> => ({ ok: true }));
      renderPanel({ accounts: TIKTOK_CONNECTED, disconnect });

      const dialog = openDialog();
      await act(async () => {
        fireEvent.click(within(dialog).getByRole("button", { name: "Putuskan" }));
      });

      expect(disconnect).toHaveBeenCalledWith("tiktok");
      expect(screen.getByRole("status")).toHaveTextContent("Akun TikTok diputuskan");
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("shows it is working and cannot be pressed again while the disconnect is on its way", async () => {
      let finish: (outcome: DisconnectOutcome) => void = () => {};
      const disconnect = vi.fn(() => new Promise<DisconnectOutcome>((resolve) => (finish = resolve)));
      renderPanel({ accounts: TIKTOK_CONNECTED, disconnect });

      fireEvent.click(within(openDialog()).getByRole("button", { name: "Putuskan" }));

      expect(within(row("TikTok")).getByRole("button", { name: "Memutuskan…" })).toBeDisabled();
      await act(async () => finish({ ok: true }));
      expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it("shows the refusal in the row and keeps the account as it was", async () => {
      const disconnect = vi.fn(
        async (): Promise<DisconnectOutcome> => ({
          ok: false,
          code: "HTTP_500",
          message: "Koneksi tidak bisa diputuskan. Coba lagi.",
        }),
      );
      renderPanel({ accounts: TIKTOK_CONNECTED, disconnect });

      const dialog = openDialog();
      await act(async () => {
        fireEvent.click(within(dialog).getByRole("button", { name: "Putuskan" }));
      });

      expect(within(row("TikTok")).getByRole("alert")).toHaveTextContent("Koneksi tidak bisa diputuskan. Coba lagi.");
      expect(within(row("TikTok")).getByRole("button", { name: "Putuskan TikTok" })).toBeEnabled();
      expect(refresh).not.toHaveBeenCalled();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    // OWASP A10:2025: a server action that cannot be reached must not leave the row stuck.
    it("shows the generic refusal when the disconnect cannot reach the server, and frees the button", async () => {
      const disconnect = vi.fn(async (): Promise<DisconnectOutcome> => {
        throw new TypeError("Failed to fetch");
      });
      renderPanel({ accounts: TIKTOK_CONNECTED, disconnect });

      const dialog = openDialog();
      await act(async () => {
        fireEvent.click(within(dialog).getByRole("button", { name: "Putuskan" }));
      });

      expect(within(row("TikTok")).getByRole("alert")).toHaveTextContent(DISCONNECT_REFUSALS.GENERIC);
      expect(within(row("TikTok")).getByRole("button", { name: "Putuskan TikTok" })).toBeEnabled();
      expect(refresh).not.toHaveBeenCalled();
    });

    it("sends the disconnect through the server action when none is given", async () => {
      vi.mocked(disconnectAccount).mockResolvedValue({ ok: true });
      renderPanel({ accounts: TIKTOK_CONNECTED });

      const dialog = openDialog();
      await act(async () => {
        fireEvent.click(within(dialog).getByRole("button", { name: "Putuskan" }));
      });

      expect(disconnectAccount).toHaveBeenCalledWith("tiktok");
    });
  });
});
