"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateQuery } from "@/lib/query";

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Nothing to steer when there is only one page; the count is already in the filter bar.
  if (totalPages <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const goTo = (target: number) => {
    const query = updateQuery(searchParams.toString(), { page: String(target) });
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-[18px] py-3">
      <p className="text-[11.5px] text-muted">
        Menampilkan {first}–{last} dari {total} creator
      </p>
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] text-muted">
          Halaman {page} dari {totalPages}
        </span>
        <Button variant="ghost" disabled={page <= 1} onClick={() => goTo(page - 1)}>
          ‹ Sebelumnya
        </Button>
        <Button variant="ghost" disabled={page >= totalPages} onClick={() => goTo(page + 1)}>
          Berikutnya ›
        </Button>
      </div>
    </div>
  );
}
