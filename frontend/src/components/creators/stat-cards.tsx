import type { CreatorListResponse } from "@/lib/creators";

// Deliberately reports the whole roster, not the filtered page: these answer "how is the
// roster doing", which a filter should not change the answer to.
const CARDS = [
  { key: "total", label: "Total creator terdaftar", hint: null },
  { key: "active", label: "Kontrak aktif", hint: null },
  { key: "good", label: "Produktivitas baik", hint: "on-time tinggi, revisi rendah" },
  { key: "risk", label: "Perlu perhatian", hint: "berisiko / sering telat" },
] as const;

export function StatCards({ stats }: { stats: CreatorListResponse["stats"] }) {
  return (
    <div className="mb-[22px] grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {CARDS.map((card) => (
        <div key={card.key} className="rounded-[10px] border border-line bg-surface px-[18px] py-4">
          <p className="mb-2 text-xs text-muted">{card.label}</p>
          <p className="font-heading text-2xl font-bold">{stats[card.key]}</p>
          {card.hint ? <p className="mt-1.5 text-[11.5px] text-muted">{card.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
