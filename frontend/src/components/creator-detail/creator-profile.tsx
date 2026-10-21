import { Panel } from "@/components/ui/panel";
import { StatusDot } from "@/components/ui/pill";
import { CONTRACT_TYPE_LABELS } from "@/lib/creator-form";
import {
  ACCESS_STATE_LABELS,
  ACCESS_STATE_TONES,
  PERIOD_STATUS_LABELS,
  PERIOD_STATUS_TONES,
  creatorAccess,
  type CreatorPeriod,
  type CreatorProfile,
} from "@/lib/creator-detail";

/** How each platform is captioned on its chip, in the order the chips are laid out. */
const PLATFORMS = [
  { key: "instagram", caption: "IG" },
  { key: "tiktok", caption: "TIKTOK" },
] as const;

const CAPTION = "text-xs text-muted";

/**
 * Who the page is about: the creator's name, email and accounts, with the type and state of
 * their latest contract beside them. Everything is rendered as text, so whatever was typed
 * into a name or a handle is shown and never run (OWASP A03).
 */
export function CreatorProfilePanel({
  creator,
  current,
  today,
}: Readonly<{
  creator: CreatorProfile;
  /** The creator's latest contract; null for a creator without one. */
  current: CreatorPeriod | null;
  /** Today in Jakarta, "YYYY-MM-DD", which a revoke day is read against. */
  today: string;
}>) {
  const accounts = PLATFORMS.filter(({ key }) => creator.socials[key]);
  const access = creatorAccess(creator.accessRevokeDate, current?.endDate ?? null, today);

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <h2 className="text-lg wrap-anywhere">{creator.name}</h2>
          <p className="mt-0.5 text-[13px] text-muted wrap-anywhere">{creator.email}</p>

          {accounts.length > 0 ? (
            <ul aria-label="Akun media sosial" className="mt-3 flex flex-wrap gap-2">
              {accounts.map(({ key, caption }) => (
                <li
                  key={key}
                  className="inline-flex items-center gap-2 rounded-full border border-rule px-3 py-1 text-xs"
                >
                  <span className="text-[10.5px] font-semibold tracking-wide text-muted">
                    {caption}
                  </span>
                  <span>@{creator.socials[key]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-muted">Belum ada akun media sosial</p>
          )}
        </div>

        <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-2">
          {current ? (
            <>
              <dt className={CAPTION}>Tipe</dt>
              <dd className="text-[13px] font-semibold">{CONTRACT_TYPE_LABELS[current.type]}</dd>

              <dt className={CAPTION}>Kontrak</dt>
              <dd>
                <StatusDot tone={PERIOD_STATUS_TONES[current.status]}>
                  {PERIOD_STATUS_LABELS[current.status]}
                </StatusDot>
              </dd>
            </>
          ) : null}

          {/* Whether the creator can sign in, which only the revoke day decides. */}
          <dt className={CAPTION}>Akses</dt>
          <dd>
            <StatusDot tone={ACCESS_STATE_TONES[access.state]}>{ACCESS_STATE_LABELS[access.state]}</StatusDot>
            {access.note === null ? null : (
              <span className="mt-0.5 block max-w-64 text-xs text-muted">{access.note}</span>
            )}
          </dd>
        </dl>
      </div>
    </Panel>
  );
}
