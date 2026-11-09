/**
 * Micro-benchmarks for the display hot paths (CPL 6 MRA — behavioral analysis, `npm run bench`).
 *
 * Amounts are formatted per cell in every table and popup and trailing slashes are trimmed on
 * every proxied request, so each of these runs many times per page. The cases pin the
 * implementations by name: "pre-optimization" / "pre-S8786" cases are snapshots kept for the
 * before/after record, and "shipped" cases import the real code in this repository.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/bench/format.bench.ts
 * (Node runs the TypeScript directly; tinybench is a vitest dependency, nothing new installed.)
 */

import { Bench } from "tinybench";
import {
  formatDate,
  formatDeduction,
  formatRupiah,
} from "../../src/lib/format.ts";

const AMOUNTS = [
  500_000, 1_250_000, -200_000, 0, 75_000, 9_999_999, -1, 123_456.75, 42, 8_000,
];

const DAYS = [
  "2026-09-20",
  "2026-10-01",
  "2026-12-31",
  "2027-01-15",
  "2026-06-30",
];

const URLS = [
  "http://localhost:3001",
  "http://localhost:3001/",
  "https://api.tofly.id////////",
  "http://backend:3001//////////////////////////////",
];

/** The hoisted-NumberFormat variant that was measured and NOT adopted (kept for the record). */
const HOISTED_DIGITS = new Intl.NumberFormat("id-ID");
function formatRupiahHoisted(amount: number): string {
  return `${amount < 0 ? "-" : ""}Rp${HOISTED_DIGITS.format(Math.abs(amount))}`;
}

/** The trailing-slash trim as it stood before Sonar S8786 (commit 30244e3f). */
function withoutTrailingSlashesRegex(url: string): string {
  return url.replace(/\/+$/, "");
}

const bench = new Bench({ time: 300, warmupTime: 100 });

bench
  .add("formatRupiah — shipped (toLocaleString per call, V8-memoized: kept)", () => {
    for (const amount of AMOUNTS) formatRupiah(amount);
  })
  .add("formatRupiah — hoisted Intl.NumberFormat variant (measured, not adopted)", () => {
    for (const amount of AMOUNTS) formatRupiahHoisted(amount);
  })
  .add("formatDeduction — shipped (wraps formatRupiah)", () => {
    for (const amount of AMOUNTS) formatDeduction(amount);
  })
  .add("formatDate — shipped (control: hoisted formatters)", () => {
    for (const day of DAYS) formatDate(day);
  })
  .add("trailing slashes — shipped backward pass (post-S8786)", () => {
    for (const url of URLS) {
      let end = url.length;
      while (end > 0 && url[end - 1] === "/") end -= 1;
      url.slice(0, end);
    }
  })
  .add("trailing slashes — pre-S8786 backtracking regex", () => {
    for (const url of URLS) withoutTrailingSlashesRegex(url);
  });

await bench.run();

/** tinybench 6 reports { latency, throughput }; tinybench 2 reports { mean, hz }. Both in ms. */
function measures(task: { name: string; result?: unknown }): Record<string, string> {
  const r = task.result as Record<string, unknown> | undefined;
  const latency = r?.latency as Record<string, number> | undefined;
  const throughput = r?.throughput as Record<string, number> | undefined;
  const nsPerOp = latency ? latency.mean * 1e6 : Number(r?.mean) * 1e6;
  const opsPerSec = throughput ? throughput.mean : Number(r?.hz);
  const p99 = latency ? latency.p99 * 1e6 : NaN;
  return {
    case: task.name,
    "ops/sec": Math.round(opsPerSec).toLocaleString("en-US"),
    "ns/op": nsPerOp.toLocaleString("en-US", { maximumFractionDigits: 0 }),
    "p99 ns": Number.isNaN(p99) ? "-" : p99.toLocaleString("en-US", { maximumFractionDigits: 0 }),
  };
}

console.table(bench.tasks.map(measures));
