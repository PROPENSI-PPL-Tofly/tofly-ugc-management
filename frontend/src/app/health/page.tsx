"use client";

import { useEffect, useState } from "react";

type Status = "checking" | "ok" | "error";

const LABEL: Record<Status, string> = {
  checking: "checking…",
  ok: "ok",
  error: "error",
};

const TONE: Record<Status, string> = {
  checking: "text-zinc-500 dark:text-zinc-400",
  ok: "text-green-600 dark:text-green-400",
  error: "text-red-600 dark:text-red-400",
};

export default function HealthPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    // Client-side on purpose. A server component fetching the backend directly
    // would only prove that one container can reach another; this walks the
    // path that actually matters: browser → frontend → proxy → backend → db.
    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch("/api/health");
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (cancelled) return;
        setStatus("ok");
        setDetail(JSON.stringify(body));
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setDetail(error instanceof Error ? error.message : String(error));
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-16 font-sans">
      <h1 className="text-sm uppercase tracking-widest text-zinc-500">Health</h1>
      <p className={`text-4xl font-semibold ${TONE[status]}`} data-testid="status">
        {LABEL[status]}
      </p>
      {detail ? (
        <p className="font-mono text-sm text-zinc-500" data-testid="detail">
          {detail}
        </p>
      ) : null}
      <p className="max-w-sm text-center text-xs text-zinc-400">
        Fetches <code>/api/health</code>, which this app proxies to the backend, which runs a
        live query against Postgres.
      </p>
    </main>
  );
}
