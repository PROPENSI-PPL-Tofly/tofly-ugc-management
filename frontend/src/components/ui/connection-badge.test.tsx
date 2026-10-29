import { render, screen } from "@testing-library/react";
import { NOT_CONNECTED, type SocialConnection } from "@/lib/social-connection";
import { ConnectionBadge } from "./connection-badge";

const CONNECTED: SocialConnection = {
  connected: true,
  connectedAt: "2026-10-29T10:00:00Z",
  lastSyncAt: null,
};

describe("ConnectionBadge", () => {
  it("shows a connected account as a green Terhubung", () => {
    render(<ConnectionBadge platform="Instagram" connection={CONNECTED} />);

    const badge = screen.getByRole("button", { name: "Instagram Terhubung" });
    expect(badge).toHaveClass("bg-green-wash", "text-green-ink");
  });

  it("explains a connected account in a tooltip tied to the badge", () => {
    render(<ConnectionBadge platform="Instagram" connection={CONNECTED} />);

    const badge = screen.getByRole("button", { name: "Instagram Terhubung" });
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent(
      "Terhubung sejak 29 Okt 2026 · sinkron terakhir —.",
    );
    expect(badge).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("shows an account that is not connected as a grey Belum terhubung, saying why", () => {
    render(<ConnectionBadge platform="TikTok" connection={NOT_CONNECTED} />);

    const badge = screen.getByRole("button", {
      name: "TikTok Belum terhubung",
    });
    expect(badge).toHaveClass("bg-surface-2", "text-muted");
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Creator belum menghubungkan akun ini, jadi angka performanya belum bisa ditarik otomatis.",
    );
  });

  it("never calls an account that is not connected Terhubung", () => {
    render(<ConnectionBadge platform="TikTok" connection={NOT_CONNECTED} />);

    expect(screen.queryByText("Terhubung")).toBeNull();
  });

  it("can be reached with the keyboard, where its tooltip opens on focus", () => {
    render(<ConnectionBadge platform="Instagram" connection={CONNECTED} />);

    const badge = screen.getByRole("button", { name: "Instagram Terhubung" });
    badge.focus();

    expect(badge).toHaveFocus();
    expect(badge).toHaveAttribute("type", "button");
  });

  it("gives each badge on a row its own tooltip", () => {
    render(
      <>
        <ConnectionBadge platform="Instagram" connection={CONNECTED} />
        <ConnectionBadge platform="TikTok" connection={NOT_CONNECTED} />
      </>,
    );

    const [first, second] = screen.getAllByRole("tooltip");
    expect(first.id).not.toBe(second.id);
    expect(
      screen.getByRole("button", { name: "TikTok Belum terhubung" }),
    ).toHaveAttribute("aria-describedby", second.id);
  });
});
