import { render, screen } from "@testing-library/react";
import type { ConnectedAccount } from "@/lib/connected-accounts";
import { ConnectPrompt } from "./connect-prompt";

function account(overrides: Partial<ConnectedAccount> = {}): ConnectedAccount {
  return {
    platform: "instagram",
    hasAccount: true,
    connected: false,
    username: null,
    connectedAt: null,
    lastSyncAt: null,
    ...overrides,
  };
}

describe("ConnectPrompt", () => {
  it("prompts to connect an account that is not connected, the way the panel above links (AC 20)", () => {
    render(<ConnectPrompt accounts={[account()]} />);

    expect(screen.getByText(/Akun Instagram belum terhubung/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hubungkan" })).toHaveAttribute(
      "href",
      "/api/social/instagram/connect",
    );
    expect(screen.getByRole("link", { name: "Hubungkan" })).toHaveAttribute("target", "_blank");
  });

  it("prompts once per unconnected account", () => {
    render(
      <ConnectPrompt
        accounts={[account(), account({ platform: "tiktok", connected: true, username: "satrialeka" })]}
      />,
    );

    expect(screen.getAllByRole("link", { name: "Hubungkan" })).toHaveLength(1);
  });

  it("says nothing while every account is connected", () => {
    render(
      <ConnectPrompt accounts={[account({ connected: true }), account({ platform: "tiktok", connected: true })]} />,
    );

    expect(screen.queryByText(/belum terhubung/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Hubungkan" })).not.toBeInTheDocument();
  });
});
