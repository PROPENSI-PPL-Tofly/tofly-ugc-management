"use client";

import { SearchBox } from "@/components/filters/filter-controls";
import { useUrlFilters } from "@/lib/use-url-filters";

/**
 * Pengguna Admin's one filter: a search over name and email, written to `?q=` once typing
 * pauses and dropping the old page number with it, since page 3 of the old search says nothing
 * about page 3 of the new one.
 */
export function AdminUserFilters() {
  const { search, setSearch } = useUrlFilters();

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3">
      <SearchBox
        label="Cari admin"
        placeholder="Nama atau email..."
        value={search}
        onChange={setSearch}
      />
    </div>
  );
}
