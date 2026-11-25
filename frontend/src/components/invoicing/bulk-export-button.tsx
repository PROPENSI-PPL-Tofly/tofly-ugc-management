"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

const DEFAULT_FILENAME = "Rekap_Invoice.zip";
export const EXPORT_FAILED = "Gagal membuat rekap. Coba lagi.";

/** The server's Content-Disposition is the name of the file the browser must save. */
export function downloadFilename(header: string | null): string {
  if (!header) return DEFAULT_FILENAME;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      return DEFAULT_FILENAME;
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  return quoted ? quoted[1] : DEFAULT_FILENAME;
}

/** Pressed from the Rate & Invoicing table; hands the result to the board for the toast/notice. */
export function BulkExportButton({
  ids,
  exportable,
  onDone,
  onFailure,
}: Readonly<{
  ids: readonly string[];
  /** How many of the ids go into the file (Running and Cancelled are skipped); defaults to all. */
  exportable?: number;
  onDone: (message: string) => void;
  onFailure: (message: string) => void;
}>) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const response = await apiFetch("/api/invoices/bulk-export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoiceIds: ids }),
      });
      if (!response.ok) throw new Error("export failed");

      const filename = downloadFilename(response.headers.get("content-disposition"));
      const url = URL.createObjectURL(await response.blob());
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
      onDone(`${filename} diunduh (${exportable ?? ids.length} invoice).`);
    } catch {
      onFailure(EXPORT_FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="accent"
      disabled={busy || ids.length === 0}
      aria-busy={busy}
      onClick={download}
      className="min-h-11"
    >
      {busy ? (
        <>
          <span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Menyiapkan…
        </>
      ) : (
        `Unduh Terpilih${ids.length > 0 ? ` (${ids.length})` : ""}`
      )}
    </Button>
  );
}
