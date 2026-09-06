#!/usr/bin/env node
// Generate a flat "coverage | NN%" SVG badge from a Vitest v8 coverage-summary.json.
// Metric = rounded line coverage. Color scales with the percentage.
// Usage:  node scripts/coverage-badge.mjs <summary.json> <out.svg>
//         node scripts/coverage-badge.mjs --selfcheck
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function color(pct) {
  if (pct < 50) return '#e05d44'; // red
  if (pct < 70) return '#fe7d37'; // orange
  if (pct < 80) return '#dfb317'; // yellow
  if (pct < 90) return '#a4a61d'; // yellow-green
  return '#4c1'; // bright green
}

// Rough per-character width at 11px Verdana; good enough for a stable badge.
const textWidth = (s) => s.length * 7 + 10;

function svg(label, value, fill) {
  const lw = textWidth(label);
  const vw = textWidth(value);
  const w = lw + vw;
  const lx = lw / 2;
  const vx = lw + vw / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="20" fill="#555"/>
    <rect x="${lw}" width="${vw}" height="20" fill="${fill}"/>
    <rect width="${w}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${lx}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${lx}" y="14">${label}</text>
    <text x="${vx}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${vx}" y="14">${value}</text>
  </g>
</svg>
`;
}

function badgeFromSummary(summaryPath) {
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const pct = Math.round(summary.total.lines.pct);
  return { pct, svg: svg('coverage', `${pct}%`, color(pct)) };
}

function selfcheck() {
  const assert = (cond, msg) => {
    if (!cond) throw new Error('selfcheck failed: ' + msg);
  };
  assert(color(49) === '#e05d44', 'red boundary');
  assert(color(79) === '#dfb317', 'yellow boundary');
  assert(color(80) === '#a4a61d', 'yellow-green at threshold');
  assert(color(100) === '#4c1', 'bright green');
  const out = svg('coverage', '95%', color(95));
  assert(out.includes('coverage: 95%') && out.includes('#4c1'), 'svg content');
  console.log('selfcheck ok');
}

const [a, b] = process.argv.slice(2);
if (a === '--selfcheck') {
  selfcheck();
} else if (a && b) {
  const { pct, svg: out } = badgeFromSummary(a);
  mkdirSync(dirname(b), { recursive: true });
  writeFileSync(b, out);
  console.log(`wrote ${b} (${pct}%)`);
} else {
  console.error('usage: coverage-badge.mjs <summary.json> <out.svg> | --selfcheck');
  process.exit(1);
}
