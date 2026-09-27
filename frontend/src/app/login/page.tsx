import Link from "next/link";
import { buttonClasses } from "@/components/ui/button-classes";
import { Panel } from "@/components/ui/panel";
import { loginErrorMessage } from "@/lib/login-errors";

export const metadata = {
  title: "Masuk — Tofly",
};

const ALERT =
  "rounded-(--radius-control) border border-red-wash bg-red-wash px-3 py-2 text-[13px] text-red-ink";

/** Google's "G", in Google's own colours as its sign-in branding requires. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 18 18" className="size-4 shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

/**
 * The one way into Tofly (PRD 3.1): Google identifies the person, then the admin's whitelist
 * decides whether and as whom they get in. The backend owns the whole OAuth flow, so this page
 * is a link plus the reason the last attempt came back here.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const error = loginErrorMessage((await searchParams).error);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-[360px]">
        <Panel>
          <div className="px-6 py-7">
            <p className="text-[12.5px] font-semibold text-accent">Tofly</p>
            <h1 className="mt-1 text-[20px]">Masuk ke Tofly</h1>
            <p className="mt-2 text-[13px] text-muted">
              Gunakan akun Google yang sudah didaftarkan oleh Admin.
            </p>
            {error ? (
              <p role="alert" className={`mt-4 ${ALERT}`}>
                {error}
              </p>
            ) : null}
            {/* A plain anchor: the flow must be a full-page navigation, and next/link would
                prefetch it, which on this URL means starting a sign-in nobody asked for. The
                lint rule targets page links; this is an API route that redirects to Google. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/api/auth/google"
              className={`${buttonClasses()} mt-5 flex w-full items-center justify-center gap-2 py-2 text-[13px]`}
            >
              <GoogleMark />
              Masuk dengan Google
            </a>
          </div>
        </Panel>
        <p className="mt-4 text-center text-[12.5px]">
          <Link
            href="/privasi"
            className="text-muted underline underline-offset-2 hover:text-ink"
          >
            Kebijakan Privasi
          </Link>
        </p>
      </div>
    </main>
  );
}
