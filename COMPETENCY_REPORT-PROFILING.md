# Competency Report — Behavioral Quality Analysis: Profiling & Performance (CPL 6 MRA)

Target rubric — Static Analysis of Program Quality, **Level 4**:

> "Uses other tools for program quality analysis and shows the impact on profiling or
> performance. Not just static analysis, but also behavioral analysis."

Secondary target — Profiling / Optimizing Code (CPL 6 AA), Level 3:

> "Able to further fix functionality and improve non-functional quality, justified by the
> profiling analysis (e.g. refactoring SQL based on query plan analysis). Able to show an
> improvement of more than 50%."

Work: branch `chore/profiling-benchmarks` (based on `origin/staging` @ `3b25053c`) —
three commits: the measured optimization (`6da0b0bd`), the analysis tooling (`3d1132bd`) and
the evidence document (`029ec74c`). Full methodology and raw numbers live in
`docs/perf/profiling-notes.md`. **§4 is the `jakartaDay` case-study walkthrough (issue
identification → cause → resolution, with every command), §5 is the proof pack (lecturer
walkthrough), §6 shows the code before and after, §7 connects the numbers to the
application's seamlessness.**

---

## 1. Why behavioral analysis is a different instrument from static analysis

Static analysis reads the code; behavioral analysis runs it. The distinction decided two of
this week's three findings:

*   **Sonar could never see that `jakartaDay` was slow.** Constructing
    `new Intl.DateTimeFormat(...)` inside a per-row function is *correct* code — no rule
    flags it. Only executing it (micro-bench + CPU profile) reveals that the constructor was
    **89.6% of a realistic workload's CPU**.
*   **A plausible-sounding optimization was wrong, and only measurement knew.** Hoisting a
    locale formatter is the textbook fix for the `jakartaDay` problem — so the same fix looks
    right for `formatRupiah`. Measured: it is **~20% slower** on V8, which memoizes the
    formatter behind `toLocaleString`. Static reasoning would have shipped a pessimization.

So the project now uses the layered model: SonarCloud (static, every push), the test suite and
coverage thresholds (behavioural, every push), Stryker (behavioural — do the tests catch
mutants), OWASP ZAP (behavioural — what the app actually sends), and this branch adds
**micro-benchmarks, CPU profiling and query-plan analysis** (behavioural — how fast, and where
the time goes).

## 2. What the tools are and how they are applied (the standard pattern again)

| Tool | Where it lives | What it answers |
|---|---|---|
| tinybench micro-benchmarks | `frontend/scripts/bench/format.bench.ts`, `backend/scripts/bench/evergreen.bench.ts`, `npm run bench` in both packages | Is this function faster or slower, and by how much? Snapshot cases pin the before/after implementations side by side |
| V8 CPU profiler + summarizer | `backend/scripts/bench/profile-workload.mjs` (`node --cpu-prof`), `summarize-cpuprofile.mjs` | Where does the CPU actually go? Top functions by self-time, before and after a change |
| PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` | `backend/scripts/bench/explain-hot-queries.sql` on a **disposable** Postgres 17 container | Which plan does the planner choose, which index does it use, and what does a candidate index really do at scale? |

Same six-step discipline as the static-analysis loop: define the workload → run the tool →
read the measurement → change the code (or don't) → re-measure → record the evidence.

## 3. Findings and impact — before and after

### Finding 1 — `jakartaDay` constructed a DateTimeFormat per call (**fixed, measured**)

`jakartaDay` is called per row while content tags are judged (`content-tags`,
`creator-access`) and per request at the whitelist resolver. The CPU profile of a realistic
workload (102,400 day comparisons + 20,000-row deadline sort) named it **89.6% of all CPU
(11,243 ms of self time)**.

| | before | after | improvement |
|---|---|---|---|
| per call | ~34–45 µs | **~0.86 µs** | **≈ 40–50×** |
| whole workload (self time) | ≈ 12.5 s (8,270 samples) | **≈ 0.54 s** (352 samples) | **≈ 23×, 98% CPU removed** |

Fix: one hoisted `Intl.DateTimeFormat` beside the file's existing hoisted formatters
(`6da0b0bd`, `backend/src/creators/evergreen.ts`). Behavior identical — 2,954 backend tests
green — and the re-profile shows the hotspot gone. **Far beyond the rubric's ">50%
improvement".**

### Finding 2 — the `formatRupiah` "optimization" was a pessimization (**measured, reverted**)

A hoisted `Intl.NumberFormat` for `formatRupiah` mirrors Finding 1's fix. Measured across
three independent runs: **~334k ops/s (kept `toLocaleString`) vs ~252k ops/s (hoisted)** — the
"optimized" variant is ~20% slower because V8 memoizes the locale formatter across
`toLocaleString` calls. The change was **reverted**; the bench keeps the variant on record
(`format.bench.ts`, case "measured, not adopted") and a code comment records why. This is the
behavioural-analysis value in its purest form: the tool prevented a regression that code
review would have applauded.

### Finding 3 — query-plan analysis of the invoice roster (**checked at scale, one candidate rejected**)

`EXPLAIN (ANALYZE, BUFFERS)` on a disposable Postgres 17 seeded with 50,000 creators /
100,000 contracts / 60,000 links, mirroring `prisma-invoice-roster.repository.ts`'s SQL:

*   Contents of a contract page and one invoice's adjustments are **already optimal** —
    existing composite indexes used (0.17 ms / 0.08 ms). No action.
*   The I2.3 contract-end range filter rides a seq scan; the candidate `contracts(end_date)`
    index was created, measured and **rejected**: it wins narrow windows (28 → 18 ms at 4%
    selectivity) but **regresses the windows the table is actually filtered by** (57 → 116 ms
    at 17% selectivity — "this month", "next 30 days") at every size tested. Shipping it would
    have made the common case 2× slower; the evidence is the crossover table below.
*   A `creators(first_name, last_name, id)` index to remove the name sort was likewise
    tested and rejected (plan unchanged, timings unchanged).
*   The real ceiling recorded for later: the repository loads every matching creator and the
    service pages in memory — the fix at scale is SQL pagination, not an index.

---

## 4. WALKTHROUGH — the `jakartaDay` story: discovery → why slow → resolution

The full story of the one finding that changed shipped code, as it happened: how the problem
was discovered, why it was making the system slow, and how it was resolved and proven — with
the exact commands at each step. (This is the narrative; §5 is the same material as a
10-minute live demo, §6.1 shows the code.)

The running story to tell while reading it:

> "The system was slow and no rule in any static-analysis tool could explain it. So I
> instrumented the real call pattern and ran a profiler — which named a three-line date
> function as 89.6% of the CPU. I found the mechanism with a micro-bench, fixed it by
> building the formatter once instead of per call, and proved the win by re-running the same
> profile: the workload went from 12.5 s to 0.54 s."

### ① Discovery — how I found it

**The trigger was a user-shaped symptom, not a code smell.** Content Plan, Task Saya and the
Rate & Invoicing roster were sluggish at scale: fine with ten rows, stuttering with hundreds.
Nothing was wrong functionally — every test passed — so the first question was *where does
the time actually go?*

**Step 1 — establish the workload (what the app really does per row).** Behavioral analysis
needs a workload that mirrors production behaviour, so I wrote
`backend/scripts/bench/profile-workload.mjs`: it replays exactly the per-row pattern the
request paths make — `jakartaDay` twice per row while content tags are judged (as
`content-tags.ts` and `creator-access.ts` do), `readableDay` for admin messages, and the
shared deadline sort over a 20,000-row table — 102,400 day comparisons in total, pure and
deterministic (no DB, no Nest).

**Step 2 — run the profiler over it.** The V8 CPU profiler, then the summarizer that ranks
functions by self time:

```powershell
cd backend
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --cpu-prof --cpu-prof-dir=.profiles scripts/bench/profile-workload.mjs
node scripts/bench/summarize-cpuprofile.mjs .profiles\<newest>.cpuprofile
```

**Step 3 — read the top of the table.** The summarizer printed, at the top:

```
jakartaDay  src/creators/evergreen.ts    89.6%    11243.9 ms
```

That was the discovery moment: one three-line date function was **89.6% of the workload's
CPU** — and, tellingly, a function no static-analysis tool had ever flagged.

**Step 4 — isolate it, to be sure the name is real.** A micro-bench with the shipped
implementation and the old one kept side by side (`npm run bench`, same machine, same
minute):

```powershell
npm run bench
```

```
│ jakartaDay — shipped                                       │  72,634 │  13,768 │   ← AFTER
│ jakartaDay — pre-optimization (new DateTimeFormat per call) │   1,376 │ 726,621 │   ← BEFORE
```

(`ns/op` is one loop of 16 calls — ~0.86 µs/call after vs ~34–45 µs/call before.) The
profiler's name and the micro-bench's number agreed: **the same function, 40–50× apart**,
depending only on whether the formatter was built per call.

**Why discovery needed behavior, not reading:** `new Intl.DateTimeFormat(...)` inside a
function is *correct* code — SonarCloud reports zero issues on it, and code review sees a
readable one-liner. The cost exists only at runtime, and only in proportion to call volume.
That is exactly the rubric's "not just static analysis, but also behavioral analysis": the
bug was invisible to every tool that reads code and loud to every tool that runs it.

### ② Why it was making the system slow

**The mechanism in one line:** `jakartaDay` built a **new `Intl.DateTimeFormat` on every
call**, and building one is expensive while using one is cheap.

What the constructor actually costs: `new Intl.DateTimeFormat('en-CA', { timeZone:
'Asia/Jakarta' })` resolves ICU locale data and the time zone's offset rules — hundreds of
microseconds of work — then `.format()` does the cheap part. So the old code paid the
**setup cost** instead of the **formatting cost**, every single time. The one-liner that
proves it without any project code:

```powershell
node -e "let t=performance.now(); for(let i=0;i<10000;i++){ new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}); } console.log('construct 10,000 formatters:', (performance.now()-t).toFixed(0), 'ms'); t=performance.now(); const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}); for(let i=0;i<10000;i++){ f.format(new Date()); } console.log('format 10,000x with ONE formatter:', (performance.now()-t).toFixed(0), 'ms');"
```

Expected: `construct 10,000 formatters: ~300–400 ms` vs `format 10,000x with ONE formatter:
~10–30 ms`. **Building the calendar costs more than reading it a thousand times.**

**Why that translated into a slow system — the call pattern.** `jakartaDay` is not called
once per request; it is called **per row and per decision** (16 call sites across 12
modules):

*   **Tag judging, per row** — `content-tags.ts` calls it 2–3 times per content (deadline
    day, both late-hand-in checks, the overdue comparison). Every list read walks this loop:
    Content Plan, Task Saya, Creator Detail.
*   **Invoice calculation, per contract and per content** — `invoice-days.ts`,
    `penalty.component.ts`, `fixed-rate.component.ts`, `invoice-rows.ts`,
    `invoice-command.service.ts`. Reading the Rate & Invoicing roster computes all of these
    per row.
*   **Every Google sign-in** — `prisma-whitelist-resolver.ts` runs it on each login
    (`creator-access.ts` on each access check) — invisible, but always-on.
*   **Detail views and workflows** — `content-detail.ts`, `contents.service.ts`,
    `content-edit.service.ts`, `link-change.service.ts`, `proposal-review.ts`,
    `creator-onboarding.service.ts`, `my-contents.service.ts`.

So the wasted microseconds stack with row count: 5,000 rows × ~35 µs ≈ **175 ms of pure
formatter waste in one request** — on top of the real work. Two secondary effects made it
feel even worse than the raw time: the per-call formatter is an **allocation**, so thousands
of short-lived objects per request add **GC pauses** (the little stutters users notice but
can't name); and it hit the **worst pages** — the biggest tables — so the slowdown scaled
exactly with how much work the user was doing.

In short: correct code, wrong lifecycle. The formatter is immutable and identical on every
call; nothing about it needs to be rebuilt per row.

### ③ Resolution — the fix, the proof, and the commit

**The fix** (commit `6da0b0bd`, `backend/src/creators/evergreen.ts`): hoist the formatter to
module scope — build it **once per process** instead of once per call:

```powershell
git show 6da0b0bd
```

Expected: one `const JAKARTA_DAY = new Intl.DateTimeFormat(...)` added beside the file's
existing hoisted formatters (`READABLE_DAY` was already there), and `jakartaDay` reduced to
`JAKARTA_DAY.format(now)`. Same signature, same output — 2,954 backend tests green, no
behaviour change. The full before/after code is in §6.1.

Note the fix restored the project's own convention rather than inventing one: the frontend's
`jakartaDay` in `format.ts` already used a hoisted formatter, and `READABLE_DAY` was hoisted
three lines below in the same file. The slow version was the outlier.

**The proof** — re-run the exact same two measurements from ①:

```powershell
cd backend
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --cpu-prof --cpu-prof-dir=.profiles scripts/bench/profile-workload.mjs
node scripts/bench/summarize-cpuprofile.mjs .profiles\<newest>.cpuprofile
npm run bench
```

| | before | after | improvement |
|---|---|---|---|
| per call (micro-bench) | ~34–45 µs | **~0.86 µs** | **≈ 40–50×** |
| workload self time (profiler) | ≈ 12.5 s (8,270 samples) | **≈ 0.54 s** (352 samples) | **≈ 23×, 98% CPU removed** |

The re-profile shows `jakartaDay` gone from the top of the table. The per-call ratio (40–50×)
and the whole-workload ratio (23×) are both far beyond the rubric's ">50% improvement" bar —
and the workload number is the one that maps to what users feel.

**The evidence trail, end to end:** symptom (slow lists at scale) → workload
(`profile-workload.mjs`) → profile (`node --cpu-prof` + `summarize-cpuprofile.mjs`, 89.6%)
→ isolation (`npm run bench`, 40–50×) → mechanism (the `node -e` construct-vs-format proof)
→ fix (`git show 6da0b0bd`) → re-profile (0.54 s, hotspot gone) → tests (2,954 green). Every
command in that chain is runnable from the branch; that chain *is* the answer to "from issue
identification to issue resolution, by showing the related commit".

---

## 5. PROOF PACK — the lecturer walkthrough (run it live, in this order)

**The demo takes ~10 minutes.** Every step prints its own before/after. The running story to
tell while the commands run:

> "Static analysis reads the code; I ran the code. One function was slow for a reason only a
> profiler could see, I fixed it 40×, and — just as important — I proved two other 'fixes'
> were not fixes and left them alone."

### 4.0 Before you walk in — setup checklist

```
✅ Node 24+ (the benches run TypeScript directly via Node's type stripping)
✅ branch checked out:  git checkout chore/profiling-benchmarks
✅ deps installed:      npm ci  (in frontend/ and backend/)
✅ Docker running       (Finding 3 only)
✅ run once yourself    (npm run bench in both packages) so there are no first-run surprises
```

Each of the three findings follows the same four beats:
**① measure the slowness → ② show the reason → ③ show the fix and its commit → ④ show the
before/after.** The code for every beat is in §6.

---

### BEFORE → AFTER AT A GLANCE (the table to keep on screen)

| Finding | what was slow | BEFORE | AFTER | verdict |
|---|---|---|---|---|
| 1 · `jakartaDay` | a new `Intl.DateTimeFormat` built per call | ~34–45 µs/call · workload 12.5 s · **89.6% of all CPU** | **~0.86 µs/call** · workload **0.54 s** | **fixed — 40–50× per call, 23× workload** |
| 2 · `formatRupiah` | "hoist the formatter" *looks* like the same fix | "optimized" variant **252k ops/s** | kept code **334k ops/s** | **fix rejected — it was 20% slower** |
| 3 · invoice roster SQL | suspected missing index on `contracts(end_date)` | narrow window 28 ms · **common window 57 ms** | with index: 18 ms · **common window 116 ms** | **index rejected — 2× slower where it matters** |

---

### Finding 1 walkthrough — the real optimization (~5 min)

**① Measure the slowness** — both implementations sit side by side in one run (the bench keeps
the old one as a named snapshot, so the comparison is same-machine, same-minute):

```powershell
cd backend
npm run bench
```

Expected (abridged — `ns/op` is one loop of 16 calls):

```
│ jakartaDay — shipped                                       │  72,634 │  13,768 │   ← AFTER
│ jakartaDay — pre-optimization (new DateTimeFormat per call) │   1,376 │ 726,621 │   ← BEFORE
```

Say: *"Same machine, same minute — 13.8 microseconds versus 727. That's the slowness."*

**② Show the reason** — the constructor is the cost, not the formatting. One command proves
it without any project code:

```powershell
node -e "let t=performance.now(); for(let i=0;i<10000;i++){ new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}); } console.log('construct 10,000 formatters:', (performance.now()-t).toFixed(0), 'ms'); t=performance.now(); const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}); for(let i=0;i<10000;i++){ f.format(new Date()); } console.log('format 10,000x with ONE formatter:', (performance.now()-t).toFixed(0), 'ms');"
```

Expected: `construct 10,000 formatters: ~300–400 ms` vs `format 10,000x with ONE formatter:
~10–30 ms`. Say: *"Building the calendar costs more than reading it a thousand times. The old
code rebuilt it for every row."* (The code itself is in §6.1.)

Optional deeper proof — reproduce the **89.6% CPU profile** live (3 min):

```powershell
git worktree add $env:TEMP\before-profile chore/profiling-benchmarks
# Windows: link node_modules into the worktree (junction), or run npm ci there
cd $env:TEMP\before-profile\backend
git checkout 6da0b0bd^ -- src/creators/evergreen.ts      # put the slow version back
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --cpu-prof --cpu-prof-dir=.profiles scripts/bench/profile-workload.mjs
node scripts/bench/summarize-cpuprofile.mjs .profiles\<newest>.cpuprofile
```

Expected: `jakartaDay … 89.6% … 11243.9 ms` at the top of the table. Then:

```powershell
git checkout HEAD -- src/creators/evergreen.ts           # the fix back
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --cpu-prof --cpu-prof-dir=.profiles scripts/bench/profile-workload.mjs
node scripts/bench/summarize-cpuprofile.mjs .profiles\<newest>.cpuprofile
```

Expected: workload finishes in ~0.5 s (vs ~12.5 s) and `jakartaDay` drops to a few percent.

**③ The fix and its commit:**

```powershell
git show 6da0b0bd
```

Expected: one hoisted `const JAKARTA_DAY = new Intl.DateTimeFormat(...)` moved to module
scope (beside the file's other hoisted formatters) and `jakartaDay` reduced to
`JAKARTA_DAY.format(now)`. Say: *"The fix is one line of behavior: build the calendar once,
outside the function. Commit `6da0b0bd`."*

**④ Before/after** — the two bench rows from ① plus this table:

| | BEFORE (`new Intl.DateTimeFormat` per call) | AFTER (hoisted) |
|---|---|---|
| per call | ~34–45 µs | **~0.86 µs** (40–50×) |
| profiling workload | 12.5 s (8,270 CPU samples) | **0.54 s** (352 samples) — 98% CPU removed |

---

### Finding 2 walkthrough — the fix that wasn't (~2 min)

**① Measure:** same command, frontend this time:

```powershell
cd ..\frontend
npm run bench
```

Expected:

```
│ formatRupiah — shipped (toLocaleString per call, V8-memoized: kept)      │ 334,309 │ 3,050 │
│ formatRupiah — hoisted Intl.NumberFormat variant (measured, not adopted) │ 252,054 │ 3,997 │
```

**② Reason:** say — *"Finding 1 taught 'hoist the formatter', so I tried the same here. But
V8 secretly reuses the locale formatter behind `toLocaleString`. The 'optimization' is 20%
slower."* (Both variants are shown as code in §6.2.)

**③ "Fix" and commit:** the fix was **not to change the code** — measured and reverted before
anything shipped. The proof of the discipline is the code comment and the bench case kept on
record (`git show 3d1132bd -- frontend/src/lib/format.ts` shows the comment; the bench label
says *"measured, not adopted"*).

**④ Before/after:** 334k ops/s (kept) vs 252k ops/s (proposed) — the "before/after" here is
*the change that would have made things worse*, caught before merge.

---

### Finding 3 walkthrough — the index that would have hurt (~3 min, needs Docker)

**① Measure the query** (one-time setup, then the plans print):

```powershell
cd backend
docker run -d --name tofly-perf-db -e POSTGRES_PASSWORD=postgres -p 15433:5432 postgres:17
Get-Content prisma\ops\bootstrap-roles.sql | docker exec -i tofly-perf-db psql -U postgres -X -q -f -
docker exec tofly-perf-db psql -U postgres -X -q -c "create role tofly_app login password 'tofly_app'" -c "grant anon, authenticated to tofly_app"
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:15433/postgres"; $env:DIRECT_URL = $env:DATABASE_URL
npx prisma migrate deploy
Get-Content scripts\bench\explain-hot-queries.sql | docker exec -i tofly-perf-db psql -U postgres -X -f -
```

Expected: Q3 and Q4 print **Bitmap Index Scan** on `contents_contract_deadline_idx` /
`invoice_adjustments_invoice_created_idx` — **0.17 ms / 0.08 ms — already optimal**; Q1
(contract-end range) prints a **Seq Scan on contracts** with `Rows Removed by Filter`.

**② Reason:** say — *"The planner scans every contract and throws most away. A textbook fix
is an index on `end_date`. Let's measure it instead of believing it."* (The query and its
Prisma source are shown in §6.3.) Scale the data so the choice matters (the script seeds 5k
creators / 10k contracts; add the rest):

```sql
-- paste into: docker exec -i tofly-perf-db psql -U postgres -X -f -
INSERT INTO users (id, email, is_admin) SELECT md5('user-'||i)::uuid,'perf-'||i||'@example.com',false FROM generate_series(5001,50000) i;
INSERT INTO creators (id, user_id, first_name, last_name) SELECT md5('creator-'||i)::uuid, md5('user-'||i)::uuid,'Perf'||(i%97),'Creator'||i FROM generate_series(5001,50000) i;
INSERT INTO contracts (id, creator_id, start_date, end_date, days_between, content_quota, fixed_rate, contract_type)
SELECT md5('contract-'||i||'-'||p)::uuid, md5('creator-'||i)::uuid, DATE '2026-01-01'+(i%180),
       (CASE WHEN p=0 THEN DATE '2026-06-01' ELSE DATE '2027-03-01' END)+(i%90), 7, 24, 5000000, 'regular'::contract_type
FROM generate_series(5001,50000) i, LATERAL (VALUES (0),(1)) v(p);
ANALYZE creators, contracts;
```

**③ The experiment — before/after the candidate index, both windows:**

```sql
-- A. WITHOUT the index (the current schema)
EXPLAIN (ANALYZE) SELECT c.id FROM creators c WHERE EXISTS (SELECT 1 FROM contracts k WHERE k.creator_id=c.id AND k.end_date>=DATE '2026-06-01' AND k.end_date<=DATE '2026-06-30') ORDER BY c.first_name,c.last_name,c.id;
EXPLAIN (ANALYZE) SELECT c.id FROM creators c WHERE EXISTS (SELECT 1 FROM contracts k WHERE k.creator_id=c.id AND k.end_date>=DATE '2026-06-10' AND k.end_date<=DATE '2026-06-16') ORDER BY c.first_name,c.last_name,c.id;
-- B. WITH the candidate index
CREATE INDEX contracts_end_date_idx ON contracts (end_date); ANALYZE contracts;
-- re-run the same two EXPLAIN lines
-- C. put the schema back (the honest verdict: keep it out)
DROP INDEX contracts_end_date_idx; ANALYZE contracts;
```

**④ Before/after** (100k contracts — what the demo prints):

| window (selectivity) | BEFORE (no index) | AFTER (with `contracts(end_date)`) | verdict |
|---|---|---|---|
| 7 days (~4%) — rare | 28 ms | **18 ms** | index wins |
| 30 days (~17%) — "this month", the common filter | **57 ms** | **116 ms** | **index LOSES — 2× slower** |

Say: *"The index helps the rare case and doubles the cost of the common one. The measured
decision is to NOT ship it — and this table is why nobody will re-argue it."* (The fix's
"commit" here is `029ec74c`, the analysis itself; the SQL lives in
`3d1132bd`'s `scripts/bench/explain-hot-queries.sql`.)

---

### Closing line for the lecturer

> "One function fixed 40–50× and proven by re-profile; two plausible fixes measured and
> rejected with numbers. Static analysis found none of the three — only running the code did."

---

## 6. The code, before → after (and how it works)

### 6.1 Finding 1 — `backend/src/creators/evergreen.ts` (commit `6da0b0bd`)

**BEFORE** — a formatter built per call (correct, readable, and 40× slower):

```ts
/** Today's calendar day where the admins work (WIB), so "not before today" holds after midnight. */
export function jakartaDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(
    now,
  );
}
```

**AFTER** — one formatter, built once at module load:

```ts
/** Today's calendar day where the admins work (WIB), so "not before today" holds after midnight. */
export function jakartaDay(now: Date): string {
  return JAKARTA_DAY.format(now);
}

// Hoisted with the other formatters: jakartaDay is called per row while tags are judged, and a
// DateTimeFormat constructed per call showed as 89.6% of the day-formatting workload's CPU in
// scripts/bench/profile-workload.mjs (see docs/perf/profiling-notes.md).
const JAKARTA_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' });
```

**How it works:** `new Intl.DateTimeFormat(...)` is expensive — it resolves locale data and
time-zone rules (hundreds of microseconds); `.format()` on an existing instance is cheap
(sub-microsecond). A `DateTimeFormat` is immutable and safe to reuse, so one module-level
instance pays the construction cost **once per process** instead of once per row. Node
executes module top-level code at import, so the cost moved out of every call path — that is
the entire fix: same output, same signature, one allocation instead of thousands. Note the
surrounding code already did this right (`READABLE_DAY` is hoisted in the same file — and the
frontend's own `jakartaDay` in `format.ts` already used a hoisted `JAKARTA_DAY_FORMAT`), so
the fix restores the project's own convention rather than inventing one.

**Where it was found, what it affects, and where you see it:**

*   **Where it was found:** the CPU-profiling workload (`scripts/bench/profile-workload.mjs`)
    deliberately mimics the app's per-row pattern — the day comparisons `content-tags.ts` and
    `creator-access.ts` make while judging every row — and the profile put `jakartaDay` at
    **89.6% of that workload's CPU**. The micro-bench then isolated it: 40–50× slower than the
    hoisted formatter sitting three lines below it in the same file.
*   **What it affects (backend call sites — 16 call sites across 12 modules):**
    *   **Tag judging, per row** — `content-tags.ts` (2–3 calls per content: the deadline day,
        both late-hand-in checks, the overdue comparison). This is the hottest loop: every
        list read walks it.
    *   **Invoice calculation, per contract and per content** — `invoice-days.ts` (late days),
        `penalty.component.ts` (Evergreen penalties), `fixed-rate.component.ts` (proration),
        `invoice-rows.ts` (contract active/expired), `invoice-command.service.ts` (the
        finalize gate). Reading the Rate & Invoicing roster computes all of these per row.
    *   **Sign-in and access** — `prisma-whitelist-resolver.ts` runs it on **every Google
        sign-in**; `creator-access.ts` on every access check.
    *   **Detail views and workflows** — `content-detail.ts`, `contents.service.ts`,
        `content-edit.service.ts`, `link-change.service.ts`, `proposal-review.ts`,
        `creator-onboarding.service.ts`, `my-contents.service.ts` (Task Saya).
*   **Where you see it in the frontend** (the pages these backend paths feed):

    | Frontend screen | what the slow path fed |
    |---|---|
    | `/admin/content-plan` (Content Plan table) | the **marks under each content name** (Overdue / late) — one tag computation per row |
    | `/creator/tasks` (Task Saya) | the same per-row marks, deadline chips ("H-3", "Hari ini", "Lewat 2 hari") |
    | `/admin/creators/[id]` (Creator Detail) | the content table's marks and deadline states |
    | Content Detail panel | deadline/lifecycle day judgments |
    | `/admin/invoicing` (Rate & Invoicing) | penalty amounts per content, contract "aktif/kedaluwarsa", the finalize gate ("Bisa difinalisasi setelah kontrak berakhir") |
    | Google sign-in (all roles) | whitelist/access resolution — invisible, but on every login |

  Ten rows a page: nobody would have noticed. Hundreds of rows on Content Plan, a
  roster-wide invoice read, or a batch of logins: the wasted microseconds stacked into the
  stutter — which is exactly what §7 quantifies.

### 6.2 Finding 2 — `frontend/src/lib/format.ts` (measured, kept as-is)

**KEPT** (what ships):

```ts
/** Rupiah, as the prototype writes it: "Rp500.000", with a plain minus for what is taken off. */
export function formatRupiah(amount: number): string {
  // Number#toLocaleString is deliberately kept: a hoisted Intl.NumberFormat was measured
  // ~20% slower on V8, which memoizes the locale formatter across toLocaleString calls
  // (bench case below, and docs/perf/profiling-notes.md). Measure before optimizing.
  return `${amount < 0 ? "-" : ""}Rp${Math.abs(amount).toLocaleString("id-ID")}`;
}
```

**REJECTED** (the "optimization" that measured slower — kept only as a bench case):

```ts
const RUPIAH_DIGITS = new Intl.NumberFormat("id-ID");

export function formatRupiah(amount: number): string {
  return `${amount < 0 ? "-" : ""}Rp${RUPIAH_DIGITS.format(Math.abs(amount))}`;
}
```

**How it works:** both print identical text — which is exactly why the change *looked* safe.
The difference is invisible to reasoning: `Number.prototype.toLocaleString("id-ID")` does not
build a formatter per call on V8 — the engine memoizes the instance for the locale+options —
so the hoisted instance saves nothing, and the explicit `.format()` accessor path measured
~20% slower (three independent runs: 334k vs 252k ops/s). This is the same class of fix as
5.1, with the opposite answer: `DateTimeFormat` construction is genuinely heavy, `NumberFormat`
construction is already cached. Only measurement knows which case you are in.

### 6.3 Finding 3 — the roster query and its plans (measured, schema unchanged)

The query under analysis, as Prisma issues it (`prisma-invoice-roster.repository.ts`):

```ts
/** A named contract-end range narrows the roster in the query; without one it stays open. */
function rosterWhere(filters: InvoiceFilters): Prisma.creatorsWhereInput {
  const end: Prisma.DateTimeFilter = {};
  if (filters.contractEndFrom) end.gte = new Date(`${filters.contractEndFrom}T00:00:00Z`);
  if (filters.contractEndTo) end.lte = new Date(`${filters.contractEndTo}T00:00:00Z`);
  return Object.keys(end).length > 0
    ? { contracts: { some: { end_date: end } } }
    : HAS_CONTRACT;
}
```

**BEFORE plan** (no `end_date` index — what the demo prints in step A):

```
Seq Scan on contracts k
  Filter: ((end_date >= '2026-06-01') AND (end_date <= '2026-06-30'))
  Rows Removed by Filter: 8334
Execution Time: 57 ms   (at 100k contracts)
```

**AFTER plan** (with the candidate `contracts(end_date)` index — step B):

```
Bitmap Index Scan on contracts_end_date_idx
  Index Cond: ((end_date >= '2026-06-01') AND (end_date <= '2026-06-30'))
Execution Time: 116 ms   (worse! at 100k contracts, 17% match)
```

**How it works:** a seq scan reads every contract and discards the non-matching ones — cost
grows with table size but is very fast per row. An index jumps straight to matching dates —
but when the range matches ~17% of the table, the bitmap heap fetch and the join back to
creators cost **more** than the scan; PostgreSQL's planner estimated the index cheaper and was
wrong (its classic ~15% selectivity crossover, mis-costed here). The shipped schema's
composite `contracts(creator_id, end_date)` already serves the correlated per-creator probes.
So the code and schema stay exactly as they are — the change is the *knowledge*, captured in
`docs/perf/profiling-notes.md`'s crossover table.

---

## 7. What this does for the seamlessness of the application

"Seamless" is what the user feels when nothing ever stutters: lists open instantly, popups
don't freeze, the same page feels the same on Monday and Friday. These findings touch exactly
that, at three levels — honestly calibrated: these are **server-side microseconds per row**,
so the felt difference scales with how much the user is looking at.

*   **Big lists and batch jobs stop stuttering (Finding 1).** `jakartaDay` runs **per row**
    while content tags are judged — every row of Content Plan, Task Saya and the invoice
    roster walks it. At ten rows a page nobody notices 0.4 ms; at the scale the admin table
    actually reaches (hundreds of rows, roster-wide recalculations, the performance-sync job
    walking every link) the old cost stacked to **hundreds of milliseconds of pure formatter
    waste per request** — 5,000 rows × ~35 µs ≈ 175 ms, gone. The profiling workload's
    12.5 s → 0.54 s is that stacking made visible. Fewer allocations also means **fewer GC
    pauses**, and GC pauses are the little stutters users notice but can't name.

*   **Money-heavy screens keep their instant feel (Finding 2).** `formatRupiah` renders in
    *every* amount cell and popup of Rate & Invoicing. The rejected "optimization" would have
    made each of those 20% slower — invisible in a demo, a slow slide in daily use. Keeping
    the measured-fastest path is a seamlessness decision too; prevention shows up as the
    absence of complaints.

*   **The common filter keeps its latency (Finding 3).** "This month" / "next 30 days" on the
    invoice roster is the everyday click. The measured index would have taken it from 57 ms
    to 116 ms on a large roster — a 2× slower *default* path to speed up a rare one. Declining
    it keeps the interaction the user actually has as fast as the database can make it, and
    the queries that matter (`contentsOf`, adjustments) are already at index speed (0.08–0.17
    ms), so popups and breakdowns load without a wait.

*   **Seamlessness that lasts (the tooling).** The three tools stay in the repo (`npm run
    bench`, the profile workload, the query-plan script). The next change that makes anything
    slower gets caught by running a command — the smoothness of the application is now
    *checked*, not hoped for. That is the real "impact on quality" the rubric asks about: not
    one fast day, but a project that cannot silently get slow.

---

## 8. What the branch ships

*   The measured optimization (`6da0b0bd`) — one formatter hoisted, 40–50× on the hot path.
*   The analysis tooling (`3d1132bd`) — `npm run bench` in both packages (tinybench, zero new
    dependencies), the CPU-profiling workload and profile summarizer, the query-plan SQL, and
    the comment recording the `formatRupiah` keep-decision.
*   The evidence document (`029ec74c`) — `docs/perf/profiling-notes.md`: methodology, every
    number, the rejected-index tables, reproduction commands.
*   Verification: backend **170 files / 2,954 tests** and frontend **201 files / 3,768 tests**
    green at the tip; no schema change; no behavior change.

## 9. Rubric mapping

| Rubric | Level | Evidence |
|---|---|---|
| **Static Analysis (CPL 6 MRA) L4** — "uses other tools… shows the impact on profiling or performance… not just static analysis, but also behavioral analysis" | **4** | §1 (why behavioural is a distinct instrument), §2 (three behavioural tools), §3–§7 (profiling impact 23×/98% CPU; the measurement-reverted pessimization; query plans at 100k rows; the code in §6 and the seamlessness impact in §7 — all reproducible live per §5) |
| **"Issue identification to issue resolution, by showing the related commit"** (L2 capability, told end to end for one finding) | shown | **§4** — the `jakartaDay` walkthrough: symptom → workload → profile (89.6%) → micro-bench isolation (40–50×) → mechanism → fix (`git show 6da0b0bd`) → re-profile → 2,954 tests green, every step with its command |
| **Profiling / Optimizing Code (CPL 6 AA) L3** — "fix… justified by the profiling analysis… improvement of more than 50%" | **3** | Finding 1: profiler-named hotspot → fix → re-profile; **≈ 40–50× per call, ≈ 23× workload** — two orders of magnitude past the 50% bar. Finding 3 additionally matches "refactoring SQL based on query plan analysis" (here: justified non-change) |
| Static Analysis L1–L3 (previous report) | 3 | Unchanged; this branch adds the fourth instrument to the same QA system |

## 10. Honest limits

*   Measurements are lab numbers on one machine (Node v24.15.0, local Postgres 17 container);
    absolute values vary, ratios hold (all comparisons are same-run or cross-checked in
    triplicate).
*   The `jakartaDay` win is largest where the function is called most (per-row tag judging);
    a single call per request moves little — the profile, not the micro-bench, said which
    case applies. The seamlessness gains in §7 follow the same rule: felt at row scale,
    batch jobs and under load, not in a ten-row demo.
*   Query plans were measured at 50k–100k rows; the crossover table tells the next maintainer
    when to revisit `contracts(end_date)` (narrow-window filtering at much larger scale).
