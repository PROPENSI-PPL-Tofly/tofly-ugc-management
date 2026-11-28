// The KPI cards' number formats, as the approved design writes them (PBI-24.2). The dashboard's
// cards differ from the charts' axis formats: Rupiah below a million is written in full, and
// views in thousands carry no decimal.

import { formatRupiah } from "./format";

const LOCALE = "id-ID";

interface Unit {
  size: number;
  suffix: string;
  digits: number;
}

function decimal(value: number, digits: number): string {
  return value.toLocaleString(LOCALE, { maximumFractionDigits: digits });
}

function rounded(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/**
 * A value in the largest unit it reaches. One that rounds up to a thousand of its unit is
 * written in the next one, so 999.960.000 reads "1 M", never "1.000 jt".
 */
function short(value: number, units: readonly Unit[]): string | null {
  let index = -1;
  units.forEach((unit, at) => {
    if (value >= unit.size) index = at;
  });
  if (index < 0) return null;

  const next = index + 1 < units.length;
  if (next && rounded(value / units[index].size, units[index].digits) >= 1000)
    index += 1;

  const unit = units[index];
  return `${decimal(value / unit.size, unit.digits)} ${unit.suffix}`;
}

const RUPIAH_UNITS: readonly Unit[] = [
  { size: 1e6, suffix: "jt", digits: 1 },
  { size: 1e9, suffix: "M", digits: 1 },
];

const COUNT_UNITS: readonly Unit[] = [
  { size: 1e3, suffix: "rb", digits: 0 },
  { size: 1e6, suffix: "jt", digits: 1 },
];

/** "Rp41,2 jt", "Rp2,5 M"; below a million in full, "Rp999.400". */
export function formatRupiahShort(amount: number): string {
  const text = short(amount, RUPIAH_UNITS);
  return text === null ? formatRupiah(amount) : `Rp${text}`;
}

/** "12 rb", "1,3 jt"; below a thousand as it is. */
export function formatCountShort(count: number): string {
  return short(count, COUNT_UNITS) ?? String(count);
}

/** Whole Rupiah, "Rp32.114", for a figure that may carry decimals. */
export function formatRupiahRounded(amount: number): string {
  return formatRupiah(Math.round(amount));
}

/** A rate on the 0–100 scale with a fixed number of decimals: "86,4%", "5,12%". */
export function formatKpiPercent(digits: number): (value: number) => string {
  return (value) =>
    `${value.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

/** The size of a change, one decimal at most and without its sign: "12,4". */
export function formatChangeAmount(change: number): string {
  return decimal(Math.abs(change), 1);
}
