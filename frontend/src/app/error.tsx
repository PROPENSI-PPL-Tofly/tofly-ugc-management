"use client";

import { LoadError } from "@/components/ui/load-error";
import { Panel } from "@/components/ui/panel";
import { APP_NAME } from "@/lib/session";

/**
 * The fallback when a page or an area layout fails to render, most often because the backend
 * is down: even the signed-in check needs it. Says so in the product's words instead of the
 * framework's, and lets the visitor try again once it is back. The error itself is not shown:
 * in production it is only a digest, and its text is never meant for the visitor.
 */
export default function AppError({ retry }: Readonly<{ error: Error; retry: () => void }>) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <Panel>
          <p className="px-6 pt-6 text-center text-[12.5px] font-semibold text-accent">{APP_NAME}</p>
          <LoadError
            title="Halaman tidak bisa dimuat."
            message="Server tidak menjawab. Periksa koneksi, lalu coba lagi sebentar lagi."
            onRetry={retry}
          />
        </Panel>
      </div>
    </main>
  );
}
