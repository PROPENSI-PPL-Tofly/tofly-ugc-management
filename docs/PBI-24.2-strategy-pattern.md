# PBI-24.2 — Range filter and KPI cards: Strategy Pattern

## Why

The Executive Dashboard (PBI-24) shows six KPI cards above SCRUM-313's charts. The approved
design (Tofly Sprint 4 Prototype) draws all six the same way, but each KPI differs in four ways:

- how its figure is written (short Rupiah, short count, whole Rupiah, a rate with 1 or 2 decimals);
- what its tooltip explains (the formula, led by the full value where the card writes it short);
- how a change from the previous range is measured (relative percent, or percentage points for rates);
- whether a rise is good, bad or neutral (Total Spending is neutral; Belum Dibayar and the cost are
  lower-is-better; views and both rates are higher-is-better).

Written inline, one card component would carry a growing `switch` on the KPI for each of those.

## The pattern

Strategy (Gamma et al., _Design Patterns_): a family of interchangeable algorithms behind one
interface, chosen by the client instead of branched on inside it.

| Role                | Name                                                                                                | File                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Strategy            | `KpiStrategy` (`format`, `tip`, `change`, `polarity`, `note`)                                       | `frontend/src/lib/executive-kpi-strategies.ts`             |
| Concrete strategies | the six entries of `KPI_STRATEGIES`                                                                 | same                                                       |
| Sub-strategies      | `ChangeMeasure`: `RELATIVE`, `POINTS`; `Polarity`: `NEUTRAL`, `HIGHER_IS_BETTER`, `LOWER_IS_BETTER` | same                                                       |
| Context             | `KpiCard`, via `describeTrend`                                                                      | `frontend/src/components/executive-dashboard/kpi-card.tsx` |

`KpiCard` never asks which KPI it draws. A new KPI is one more entry in `KPI_STRATEGIES`; a new
way to measure change or judge a direction is one more `ChangeMeasure` or `Polarity`. Each strategy
is tested on its own (`executive-kpi-strategies.test.ts`).

`toExecutiveKpis` translates the backend's answer into the cards' readings. It is the codebase's
usual adapter at the API boundary, a supporting detail, not this subtask's pattern.

## Provisional contract with SCRUM-311

**Not final until the SCRUM-311 owner confirms it.** Shared example:
`frontend/src/test/fixtures/executive-kpis.contract.json`. Proposed as a `kpis` block in
`GET /dashboard/executive?months=3|6|12`, next to SCRUM-313's `months` and `creators`:

```jsonc
"kpis": {
  "current":  { "totalSpending": 41250000, "unpaidAmount": 6800000, "totalViews": 1284500,
                "costPer1000Views": 32113.6, "onTimeRate": 86.4, "engagementRate": 5.12,
                "linksAwaitingData": 3 },
  "previous": { "totalSpending": 36700000, "unpaidAmount": 0, "totalViews": 1102300,
                "costPer1000Views": 33294, "onTimeRate": 88.1, "engagementRate": null }
}
```

- The backend computes all six figures from the parent PBI's formulas; the frontend only compares
  each with its previous value.
- `previous` is the range of equal length just before the chosen one.
- `null` means no data and is shown as "—", never converted to 0. A missing or unusable value fails
  only its own card.
- Rupiah and counts are whole numbers ≥ 0; `costPer1000Views` is a number ≥ 0; rates are on the
  0–100 scale.
- `linksAwaitingData` is the current range only.
- Period labels come from SCRUM-313's `months`, not from this block.

**Open for confirmation:** does Total Spending use the finalized invoice snapshot totals after
penalties and adjustments, excluding Cancelled invoices? That is the PO's reading; the backend owner
must confirm it rather than the frontend assuming it.

## Security (OWASP Top 10 2025)

### Implemented and tested in this frontend branch

| Category                                  | Frontend control                                                                                                                   | Test                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A01 Broken Access Control                 | A refused load (401/403) shows each card's error, never figures or zeros                                                           | `kpi-section.test.tsx`                                                        |
| A02 Security Misconfiguration             | A failed load never shows its reason, which may carry backend detail                                                               | `kpi-section.test.tsx`                                                        |
| A05 Injection                             | Period label rendered as text; range and retry links drawn only for same-site paths (`isSameSitePath`); tooltip text fixed in code | `range-header.test.tsx`, `kpi-card.test.tsx`                                  |
| A06 Insecure Design                       | Fail closed: only the six allow-listed own keys are read; a missing value fails its card instead of reading as no data             | `executive-kpis.test.ts`                                                      |
| A08 Software or Data Integrity Failures   | Each value checked by type and range (whole ≥ 0, finite ≥ 0, 0–100) before display                                                 | `executive-kpis.test.ts`                                                      |
| A10 Mishandling of Exceptional Conditions | No division by a previous 0; null and failure kept apart; one failed KPI leaves the other five standing                            | `executive-kpi-strategies.test.ts`, `kpi-card.test.tsx`, `kpi-cards.test.tsx` |

### Depends on backend enforcement (SCRUM-311)

The frontend controls above limit what a bad or refused answer can do on screen. They do not replace:

- **A01:** `/dashboard/executive` must allow admins only. The frontend never decides who may read
  the figures; it only makes sure a refusal cannot read as data. (The existing admin layout guard is
  a convenience gate, not the authority.)
- **A02:** error bodies stay generic, with no stack traces or query detail.
- **A05:** the backend validates `months` against 3 / 6 / 12 itself and never builds a query from it.
- **A08:** the figures are correct at the source; the frontend can check their shape, not their truth.

### Still to add when wiring the page (blocked by SCRUM-313)

- **A05:** page test that `?range=` values outside 3 / 6 / 12 (and injection strings) fall back to 6
  and only `months` reaches the API.
- **A02:** test that the KPIs come from the page's `no-store` request on a `force-dynamic` page, so one
  admin's figures are never cached for another.

## Technical learnings

1. **Contract-first with a shared fixture.** The adapter's tests read the same JSON the backend owner
   can test their output against, so a change to the contract breaks a test on both sides instead of
   surfacing in the browser.
2. **Trend indicators that do not rely on colour alone (WCAG 1.4.1).** Each change carries a shape
   (▲ ▼ ■) as well as a colour, and a screen reader hears the move and the verdict in words ("turun,
   lebih baik"), since the shape is hidden from it and good or bad depends on the KPI.
3. **Suspense keyed by the URL's search parameters (Next.js 16 App Router).** A route's `loading.tsx`
   wraps the page once; a navigation that only changes `?range=` happens inside a transition, so React
   can keep the old cards instead of showing the fallback. `KpiSection` is an async server component
   meant for `<Suspense key={months} fallback={<KpiCardsSkeleton />}>`: a new key should remount the
   boundary, so the skeleton shows on each range change. **Not yet verified** (see Status).

## Status

### Implemented and tested (this branch)

- KPI adapter `toExecutiveKpis` and the shared contract fixture.
- The design's number formats, the six `KPI_STRATEGIES` and `describeTrend`.
- `RangeHeader` (period label, 3 / 6 / 12 Bulan links with `aria-current`, wider phone press).
- `KpiCard`, `KpiCards`, `KpiCardsSkeleton` and `KpiSection`, with per-card no-data, failed and
  loading states (AC 13).
- `buttonClasses` small size and the `animate-shimmer` token.
- Every new and touched file at 100% statements, branches, functions and lines. Each RED commit fails
  and its GREEN commit passes.

### Blocked by SCRUM-313 being merged

SCRUM-313 owns `/admin/dashboard`, its URL parsing and its loader. None of these files are on this
branch, and this branch does not change them until 313 is in the PBI-24 integration branch. Then:

- `lib/executive-dashboard.server.ts`: also return the answer's raw `kpis` block.
- `app/admin/dashboard/page.tsx`: `RangeHeader` (period from `monthLabel` of the first and last month,
  options from `RANGE_MONTHS` and `dashboardHref`), then
  `<Suspense key={state.months} fallback={<KpiCardsSkeleton />}><KpiSection … /></Suspense>` above the
  charts.
- The page tests listed under Security.

Reported to the 313 owner, not changed here: the design shows an error per chart ("{judul} tidak
bisa dimuat.") and one empty text ("Belum ada data di rentang ini."), where 313 has one page-wide
error and a different empty text per chart.

### Depends on the SCRUM-311 backend contract

- The `kpis` block's key names and shape (provisional, above). If they change, only
  `executive-kpis.ts` and the fixture change.
- The six formulas, computed by the backend.
- **Open:** whether Total Spending is the finalized snapshot total after penalties and adjustments,
  excluding Cancelled invoices.
- The access control and error hygiene listed under Security.

### Needs browser verification

- **Keyed Suspense:** that `<Suspense key={state.months}>` shows `KpiCardsSkeleton` on each range change
  under Next 16.4.3, and that Back and bookmarks keep working. Unit tests only show `KpiSection` waits
  for its load; the bundled docs do not state the navigation behaviour.
- **Phone press:** the range links' about-47px press at 375px (jsdom loads no CSS, so tests check the
  classes, not the size).
- **Shimmer:** the bar sweeps, and stays still under reduced motion.
- **Grid:** 3 / 2 columns around 900px and the 20px figures at 560px.
