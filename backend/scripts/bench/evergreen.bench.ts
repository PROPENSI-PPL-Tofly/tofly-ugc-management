/**
 * Micro-benchmarks for the day-formatting hot path (CPL 6 MRA — behavioral analysis,
 * `npm run bench`).
 *
 * `jakartaDay` is called per row while tags are judged (content-tags, creator-access) and per
 * request at the whitelist resolver, so anything it allocates is allocated per row. The
 * "pre-optimization" case is a snapshot kept for the before/after record; the "shipped" case
 * imports the real code in this repository.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/bench/evergreen.bench.ts
 * (Node runs the TypeScript directly; tinybench is a vitest dependency, nothing new installed.)
 */

import { Bench } from "tinybench";
import {
  evergreenName,
  jakartaDay,
  readableDay,
} from "../../src/creators/evergreen.ts";

const MOMENTS = Array.from(
  { length: 16 },
  (_, index) => new Date(Date.UTC(2026, 9, 1 + index, 3, 24, 51)),
);

const DAYS = Array.from({ length: 16 }, (_, index) => {
  const day = new Date(Date.UTC(2026, 9, 1 + index));
  return day.toISOString().slice(0, 10);
});

/** Today's day as the pre-optimization code read it: a fresh DateTimeFormat per call. */
function jakartaDayPerCall(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
    now,
  );
}

const bench = new Bench({ time: 300, warmupTime: 100 });

bench
  .add("jakartaDay — shipped", () => {
    for (const now of MOMENTS) jakartaDay(now);
  })
  .add("jakartaDay — pre-optimization (new DateTimeFormat per call)", () => {
    for (const now of MOMENTS) jakartaDayPerCall(now);
  })
  .add("readableDay — shipped (control: hoisted formatter)", () => {
    for (const day of DAYS) readableDay(day);
  })
  .add("evergreenName — shipped (control)", () => {
    for (const day of DAYS) evergreenName("Salsa Amelia Dewi", day, 3);
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
