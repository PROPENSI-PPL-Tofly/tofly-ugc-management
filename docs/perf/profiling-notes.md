# Profiling & performance notes (behavioral quality analysis)

Date: 9 November 2026 · Branch: `chore/profiling-benchmarks` · Purpose: quality analysis beyond
static analysis — micro-benchmarks and CPU profiling of the hot paths (Option A) and query-plan
analysis of the invoice roster's SQL (Option C), with measured before/after numbers.

Everything here ran against local, synthetic data: the micro-benches on this machine (Node
v24.15.0), the query plans on a **disposable** PostgreSQL 17 container (`tofly-perf-db`,
`127.0.0.1:15433`) seeded by `scripts/bench/explain-hot-queries.sql`. No deployed environment,
no real data.

## How to reproduce

```bash
# Micro-benchmarks (tinybench via vitest's dependency tree; nothing new installed)
cd frontend && npm run bench
cd backend  && npm run bench

# CPU profile of the day-formatting workload, then a top-functions summary
cd backend
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --cpu-prof --cpu-prof-dir=.profiles scripts/bench/profile-workload.mjs
node scripts/bench/summarize-cpuprofile.mjs .profiles/<newest>.cpuprofile

# Query plans on a disposable database (Postgres 17 in Docker)
docker run -d --name tofly-perf-db -e POSTGRES_PASSWORD=postgres -p 15433:5432 postgres:17
# bootstrap roles + prisma migrate deploy + seed (as in .github/workflows/zap.yml), then:
Get-Content backend\scripts\bench\explain-hot-queries.sql | docker exec -i tofly-perf-db psql -U postgres -X -f -
```

## 1. Micro-benchmarks — the formatter hot paths

Amounts are formatted per cell in every table and popup; `jakartaDay` is called per row while
tags are judged (`content-tags`, `creator-access`) and per request at the whitelist resolver.
Each bench case loops a fixed input set; `ns/op` is per loop (10 amounts / 16 moments).

### Backend — `jakartaDay` (the finding that changed code)

| case | ops/sec | ns/loop | per call |
|---|---|---|---|
| **shipped before** (`new Intl.DateTimeFormat` per call) | 1,376–1,826 | ~550,000–727,000 | **~34–45 µs** |
| **shipped after** (hoisted formatter) | 72,634 | 13,768 | **~0.86 µs** |
| `readableDay` (control, already hoisted) | 39,518 | 25,305 | ~1.6 µs |
| `evergreenName` (control, no Intl) | 215,989 | 4,630 | — |

**≈ 40–50× faster per call.** Fix: `backend/src/creators/evergreen.ts` hoists one
`Intl.DateTimeFormat` beside the file's existing hoisted formatters.

### Frontend — `formatRupiah` (the finding that changed *nothing*, deliberately)

| case | ops/sec | ns/loop (10 amounts) |
|---|---|---|
| `toLocaleString("id-ID")` per call (shipped — kept) | 334,000–358,000 | ~2,900–3,050 |
| hoisted `Intl.NumberFormat` variant (measured, **not adopted**) | 252,000–266,000 | ~3,800–4,000 |

A hoisted formatter sounds like the same fix as `jakartaDay`, but it measured **~20% slower**
across three independent runs: V8 memoizes the locale formatter behind
`Number.prototype.toLocaleString`, while `Intl.NumberFormat#format` on an instance pays its own
path. The code keeps `toLocaleString` and the bench keeps the variant on record — measure before
optimizing, and keep the regression test (this bench) that says why.

### Trailing slashes (Sonar S8786, commit `30244e3f`) — before/after on record

| case | ops/sec | ns/loop (4 URLs) |
|---|---|---|
| backward pass (shipped, post-S8786) | ~10,000,000 | ~90 |
| backtracking regex `/\/+$/` (pre-S8786) | ~4,700,000 | ~220 |

~2× on ordinary inputs, and the regex carries the backtracking risk Sonar flagged; the loop has
none.

## 2. CPU profiling — `scripts/bench/profile-workload.mjs`

Workload: 102,400 `jakartaDay` comparisons + 102,400 `readableDay` calls (the per-row pattern of
`content-tags`/`creator-access`) and the shared deadline sort over 20,000 rows
(`list-rows.compareByDeadline`).

| | before | after |
|---|---|---|
| workload wall (self time) | ≈ 12.5 s (8,270 samples) | ≈ 0.54 s (352 samples) |
| `jakartaDay` self time | **11,243 ms (89.6% of all CPU)** | 196 ms |
| top function | `jakartaDay` | `jakartaDay`/`readableDay` (balanced, both fine) |

The profile named the hotspot before any code changed (`jakartaDay` at 89.6% — the
`Intl.DateTimeFormat` construction), the fix is the hoist above, and the re-profile shows it
gone. **≈ 23× faster workload, 98% CPU removed.**

## 3. Query-plan analysis — the invoice roster's SQL (`explain-hot-queries.sql`)

Dataset: 50,000 creators / 100,000 contracts / 30,000 contents / 60,000 links / 10,000
invoices / 20,000 adjustments (synthetic, deterministic). Queries mirror
`prisma-invoice-roster.repository.ts` and `invoices.service.ts`.

| query | plan | verdict |
|---|---|---|
| Q3 contents of a contract page (`contract_id = ANY`, deadline order) | Bitmap Index Scan on `contents_contract_deadline_idx`, **0.17 ms** | already optimal |
| Q4 one invoice's adjustments (`invoice_id = ANY`, created order) | Bitmap Index Scan on `invoice_adjustments_invoice_created_idx`, **0.08 ms** | already optimal |
| Q2 roster, no range (`EXISTS` any contract) | Hash Semi Join + quicksort of the matching creators | acceptable; the shape (load all, page in memory) is the limit, not an index |
| Q1 roster narrowed by contract-end range (I2.3) | selectivity-dependent — see below | measured, **no index shipped** |

### Q1: candidate `contracts(end_date)` — measured, then rejected

| rows (contracts) | window | without index | with `contracts(end_date)` |
|---|---|---|---|
| 10k | 30 days (17% match) | 4.9 ms (seq scan) | 3.7 ms |
| 10k | 7 days (4% match) | 1.8 ms (seq scan) | 2.3 ms |
| 100k | 30 days (17% match) | 57 ms (seq scan) | **116 ms** (bitmap index scan) |
| 100k | 7 days (4% match) | 28 ms (seq scan) | **18 ms** |

The index wins narrow windows and **loses the wide ones the table is actually filtered by**
("this month", "next 30 days"), at every size tested — PostgreSQL's classic ~15% selectivity
crossover, made worse by the planner mis-costing the bitmap hash join. Shipping it would
regress the common case, so the schema stays as it is: the existing composite
`contracts(creator_id, end_date)` already serves the per-creator probes
(`contracts_creator_end_date_idx`), which is what the correlated form of this query uses.

A `creators(first_name, last_name, id)` index to remove the name sort was tested too: the
planner kept hash-semi-join + quicksort and the timings did not improve — also not shipped.

**Recommendation recorded for later:** the roster's real ceiling is architectural —
`InvoiceRosterRepository.creators()` loads every matching creator and the service pages in
memory. If the roster outgrows the ~100k-creator scale, page it in SQL (`ORDER BY … LIMIT
`OFFSET`) and only then revisit `contracts(end_date)` for narrow-window filters.

## 4. What changed in the shipped code

*   `backend/src/creators/evergreen.ts` — one hoisted `Intl.DateTimeFormat` in `jakartaDay`
    (≈ 40–50× per call, 98% CPU removed from the profiling workload).
*   `frontend/src/lib/format.ts` — comment only: records why `toLocaleString` is kept.
*   `backend/scripts/bench/*`, `frontend/scripts/bench/*`, `npm run bench` in both packages —
    the benches, the profiling workload, the profile summarizer and the query-plan script.
*   No schema change: see §3.

All suites run green at the branch tip after the change: backend 170 files / 2,954 tests,
frontend 201 files / 3,768 tests (`npm run test`).
