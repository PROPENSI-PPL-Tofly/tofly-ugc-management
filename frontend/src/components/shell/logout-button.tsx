"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <div className="mt-auto">
      {error ? (
        <p role="alert" className="mb-2 text-xs text-red-ink">
          Gagal keluar. Coba lagi.
        </p>
      ) : null}
      <button
        type="button"
        onClick={logout}
        disabled={pending}
        className="w-full rounded-(--radius-control) px-3 py-2 text-left text-[13px] font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60"
      >
        {pending ? "Keluar…" : "Keluar"}
      </button>
    </div>
  );
}
