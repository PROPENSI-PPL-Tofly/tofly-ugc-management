"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button-classes";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { disconnectAccount, type DisconnectOutcome } from "@/lib/connected-account-actions.server";
import {
  DISCONNECT_REFUSALS,
  DISCONNECT_WARNING,
  PERFORMANCE_PATH,
  connectErrorMessage,
  connectHref,
  connectedSince,
  connectedToast,
  disconnectedToast,
  type ConnectOutcome,
  type ConnectPlatform,
  type ConnectedAccount,
} from "@/lib/connected-accounts";

const PLATFORM_NAMES: Record<ConnectPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};

/**
 * The Akun Terhubung panel on the creator's Performa page (PBI-19, subtask 19.4): one row for
 * Instagram and one for TikTok, each with its state. "Hubungkan" is a plain link to the backend,
 * which starts the platform's OAuth flow; the platform sends the creator back here with the
 * result, which this panel reads once and then clears from the address so a reload does not
 * show it again.
 *
 * The disconnect comes in as `disconnect`, the server action by default (Dependency Inversion):
 * the panel decides when it may run and leaves how to its caller, so tests stand in for it.
 */
export function ConnectedAccountsPanel({
  accounts,
  outcome,
  disconnect = disconnectAccount,
}: Readonly<{
  accounts: ConnectedAccount[];
  outcome: ConnectOutcome | null;
  disconnect?: (platform: ConnectPlatform) => Promise<DisconnectOutcome>;
}>) {
  const router = useRouter();
  const { show, toast } = useToast();
  // Kept in state: the address is cleared right away, and the failure must stay on screen.
  const [failure] = useState(() => (outcome?.kind === "failed" ? outcome : null));
  const [connecting, setConnecting] = useState<ConnectPlatform | null>(null);
  const [confirming, setConfirming] = useState<ConnectPlatform | null>(null);
  const [disconnecting, setDisconnecting] = useState<ConnectPlatform | null>(null);
  const [refusals, setRefusals] = useState<Partial<Record<ConnectPlatform, string>>>({});
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || outcome === null) return;
    handled.current = true;
    if (outcome.kind === "connected") show(connectedToast(outcome.platform));
    router.replace(PERFORMANCE_PATH, { scroll: false });
  }, [outcome, router, show]);

  async function confirmDisconnect(platform: ConnectPlatform) {
    setConfirming(null);
    setDisconnecting(platform);
    setRefusals((current) => ({ ...current, [platform]: undefined }));
    let result: DisconnectOutcome;
    try {
      result = await disconnect(platform);
    } catch {
      // The action itself could not be reached (OWASP A10:2025): say so, and free the button.
      result = { ok: false, code: "UNAVAILABLE", message: DISCONNECT_REFUSALS.GENERIC };
    }
    setDisconnecting(null);
    if (result.ok) {
      show(disconnectedToast(platform));
      router.refresh();
    } else {
      setRefusals((current) => ({ ...current, [platform]: result.message }));
    }
  }

  function message(platform: ConnectPlatform): string | null {
    const refusal = refusals[platform];
    if (refusal) return refusal;
    return failure?.platform === platform ? connectErrorMessage(platform, failure.error) : null;
  }

  return (
    <>
      <Panel>
        <PanelHead
          title="Akun Terhubung"
          hint="Hubungkan akun media sosial untuk menarik data performa konten secara otomatis."
        />
        <div className="grid items-start gap-3 px-5 pb-5 sm:grid-cols-2">
          {accounts.map((account) => (
            <AccountRow
              key={account.platform}
              account={account}
              name={PLATFORM_NAMES[account.platform]}
              message={message(account.platform)}
              connecting={connecting === account.platform}
              disconnecting={disconnecting === account.platform}
              onConnect={() => setConnecting(account.platform)}
              onDisconnect={() => setConfirming(account.platform)}
            />
          ))}
        </div>
      </Panel>

      {confirming ? (
        <ConfirmDialog
          title={`Putuskan ${PLATFORM_NAMES[confirming]}?`}
          message={DISCONNECT_WARNING}
          confirmLabel="Putuskan"
          cancelLabel="Batal"
          onConfirm={() => void confirmDisconnect(confirming)}
          onCancel={() => setConfirming(null)}
        />
      ) : null}

      {toast}
    </>
  );
}

/** "Hubungkan" (or "Coba Lagi"): a link to the backend that becomes a busy button once pressed. */
function ConnectLink({
  platform,
  label,
  ariaLabel,
  variant,
  connecting,
  onConnect,
}: Readonly<{
  platform: ConnectPlatform;
  label: string;
  ariaLabel?: string;
  variant: "accent" | "default";
  connecting: boolean;
  onConnect: () => void;
}>) {
  if (connecting) {
    // The browser is on its way to the platform; a second press would start a second flow.
    return (
      <button type="button" disabled aria-busy="true" className={`whitespace-nowrap ${buttonClasses(variant)}`}>
        Menghubungkan…
      </button>
    );
  }
  return (
    // A plain anchor: the backend answers with a redirect to the platform, which needs a full
    // page load, not client-side navigation.
    <a href={connectHref(platform)} aria-label={ariaLabel} onClick={onConnect} className={`whitespace-nowrap ${buttonClasses(variant)}`}>
      {label}
    </a>
  );
}

function AccountRow({
  account,
  name,
  message,
  connecting,
  disconnecting,
  onConnect,
  onDisconnect,
}: Readonly<{
  account: ConnectedAccount;
  name: string;
  message: string | null;
  connecting: boolean;
  disconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}>) {
  const detail = account.connected
    ? `${account.username ? `@${account.username} · ` : ""}${connectedSince(account.connectedAt)}`
    : "Belum terhubung";

  return (
    <div role="group" aria-label={name} className="flex min-w-0 flex-col gap-3 rounded-(--radius-control) border border-rule p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{name}</p>
          <p className="mt-0.5 truncate text-xs text-muted">{detail}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {account.connected ? (
            <>
              <Pill tone="green">Terhubung</Pill>
              {disconnecting ? (
                <button type="button" disabled aria-busy="true" className={`whitespace-nowrap ${buttonClasses()}`}>
                  Memutuskan…
                </button>
              ) : (
                <button type="button" aria-label={`Putuskan ${name}`} onClick={onDisconnect} className={`whitespace-nowrap ${buttonClasses()}`}>
                  Putuskan
                </button>
              )}
            </>
          ) : (
            <ConnectLink
              platform={account.platform}
              label="Hubungkan"
              ariaLabel={`Hubungkan ${name}`}
              variant="accent"
              connecting={connecting}
              onConnect={onConnect}
            />
          )}
        </div>
      </div>

      {message ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-control) bg-red-wash px-3 py-2 text-xs text-red-ink"
        >
          <span>{message}</span>
          {connecting || account.connected ? null : (
            <ConnectLink
              platform={account.platform}
              label="Coba Lagi"
              variant="default"
              connecting={false}
              onConnect={onConnect}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
