import { Panel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { CONTRACT_TYPE_LABELS } from "@/lib/creator-form";
import {
  PERIOD_STATUS_LABELS,
  PERIOD_STATUS_TONES,
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
}: Readonly<{
  creator: CreatorProfile;
  /** The creator's latest contract; null for a creator without one. */
  current: CreatorPeriod | null;
}>) {
  const accounts = PLATFORMS.filter(({ key }) => creator.socials[key]);

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

        {current ? (
          <dl className="grid shrink-0 grid-cols-[auto_auto] items-center gap-x-4 gap-y-2">
            <dt className={CAPTION}>Tipe</dt>
            <dd>
              <Pill>{CONTRACT_TYPE_LABELS[current.type]}</Pill>
            </dd>

            <dt className={CAPTION}>Kontrak</dt>
            <dd>
              <Pill tone={PERIOD_STATUS_TONES[current.status]}>
                {PERIOD_STATUS_LABELS[current.status]}
              </Pill>
            </dd>
          </dl>
        ) : null}
      </div>
    </Panel>
  );
}
