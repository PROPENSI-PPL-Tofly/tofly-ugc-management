/**
 * CPU-profiling workload for the hot paths (CPL 6 MRA — behavioral analysis).
 *
 * Exercises the same calls the request paths make per row: `jakartaDay` while tags are judged,
 * `readableDay` in admin messages, and the shared deadline sort over a page-sized row set.
 * Synthetic, deterministic, and pure — no database, no network, no Nest.
 *
 * Run:  node --cpu-prof --cpu-prof-dir=.profiles scripts/bench/profile-workload.mjs
 * Then: node scripts/bench/summarize-cpuprofile.mjs .profiles/<newest>.cpuprofile
 */

import { compareByDeadline } from "../../src/contents/list-rows.ts";
import { jakartaDay, readableDay } from "../../src/creators/evergreen.ts";

const MOMENTS = Array.from(
  { length: 4096 },
  (_, index) => new Date(Date.UTC(2026, 9, 1, 0, 0, 0) + index * 60_000),
);

const ROWS = Array.from({ length: 20_000 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  name: `Konten ${index % 97} nomor ${index}`,
  deadline: new Date(Date.UTC(2026, 9, 1 + (index % 30))).toISOString().slice(0, 10),
}));

const now = new Date("2026-11-09T03:24:51Z");

// Per-row day judging, as content-tags/creator-access do.
let checksum = 0;
for (let round = 0; round < 25; round += 1) {
  for (const moment of MOMENTS) {
    if (jakartaDay(moment) <= jakartaDay(now)) checksum += 1;
    readableDay(moment.toISOString().slice(0, 10));
  }
}

// The shared deadline sort over a page-sized table, as the lists do.
for (let round = 0; round < 5; round += 1) {
  ROWS.sort(compareByDeadline("deadline_asc"));
}

console.log(`workload done (checksum ${checksum})`);
