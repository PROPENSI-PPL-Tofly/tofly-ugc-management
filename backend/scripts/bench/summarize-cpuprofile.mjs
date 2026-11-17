/**
 * Summarizes a V8 .cpuprofile: top functions by self time (hits), aggregated by function+file.
 * Usage: node scripts/bench/summarize-cpuprofile.mjs <profile.cpuprofile> [topN]
 */

import { readFileSync } from "node:fs";

const [path, topNArg] = process.argv.slice(2);
if (!path) {
  console.error("usage: node summarize-cpuprofile.mjs <profile.cpuprofile> [topN]");
  process.exit(1);
}
const topN = Number(topNArg ?? 15);

const profile = JSON.parse(readFileSync(path, "utf8"));
const nodes = new Map(profile.nodes.map((node) => [node.id, node]));

const byFunction = new Map();
let totalHits = 0;
for (const node of profile.nodes) {
  const hits = node.hitCount ?? 0;
  if (hits === 0) continue;
  totalHits += hits;
  const frame = node.callFrame;
  const key = `${frame.functionName || "(anonymous)"}  ${shorten(frame.url)}`;
  byFunction.set(key, (byFunction.get(key) ?? 0) + hits);
}

function shorten(url) {
  const marker = url.includes("tofly-ugc-management")
    ? url.slice(url.indexOf("tofly-ugc-management") + "tofly-ugc-management".length + 1)
    : url;
  return marker.replace(/^file:\/*/, "").replace(/\\/g, "/");
}

const intervalUs = (profile.endTime - profile.startTime) / (profile.samples?.length ?? 1);
const rows = [...byFunction.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, topN)
  .map(([name, hits]) => ({
    function: name,
    "self %": `${((hits / totalHits) * 100).toFixed(1)}%`,
    "self ms": ((hits * intervalUs) / 1000).toFixed(1),
  }));

console.log(`profile: ${path}`);
console.log(`samples: ${profile.samples?.length ?? 0}, interval ≈ ${intervalUs.toFixed(0)} µs`);
console.table(rows);
