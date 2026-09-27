"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** A door with an arrow leaving it; decorative, the button's text names the action. */
function SignOutIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
    >
      <path d="M6 2.75H3.75a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1H6" />
      <path d="M10.5 11 13.5 8l-3-3" />
      <path d="M13.5 8H6" />
    </svg>
  );
}

export function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout failed");
      router.replace("/login");
      router.refresh();
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-2 px-3 text-xs text-red-ink">
          Gagal keluar. Coba lagi.
        </p>
      ) : null}
      {/* Styled like the menu's places, so it reads as part of the rail rather than stray text. */}
      <button
        type="button"
        onClick={logout}
        disabled={pending}
        className="flex w-full items-center gap-2 rounded-(--radius-control) px-3 py-2 text-left text-[13px] font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink active:bg-rule-2 disabled:opacity-60"
      >
        <SignOutIcon />
        {pending ? "Keluar…" : "Keluar"}
      </button>
    </div>
  );
}
