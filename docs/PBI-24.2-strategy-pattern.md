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

| Role               | Name                                                | File                                                    |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------- |
| Strategy           | `KpiStrategy` (`format`, `tip`, `change`, `polarity`, `note`) | `frontend/src/lib/executive-kpi-strategies.ts` |
| Concrete strategies | the six entries of `KPI_STRATEGIES`                | same                                                    |
| Sub-strategies     | `ChangeMeasure`: `RELATIVE`, `POINTS`; `Polarity`: `NEUTRAL`, `HIGHER_IS_BETTER`, `LOWER_IS_BETTER` | same |
| Context            | `KpiCard`, via `describeTrend`                      | `frontend/src/components/executive-dashboard/kpi-card.tsx` |

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

| Category | Frontend control | Test | Backend enforcement it relies on |
| -------- | ---------------- | ---- | -------------------------------- |
| A01 Broken Access Control | A refused load (401/403) shows each card's error, never figures or zeros | `kpi-section.test.tsx` | SCRUM-311 must restrict `/dashboard/executive` to admins; the admin layout guard is the existing frontend gate |
| A02 Security Misconfiguration | A failed load never shows its reason, which may carry backend detail | `kpi-section.test.tsx` | Backend error bodies stay generic |
| A05 Injection | Period label rendered as text; range and retry links drawn only for same-site paths (`isSameSitePath`); tooltip text fixed in code | `range-header.test.tsx`, `kpi-card.test.tsx` | Backend still validates `months` itself |
| A06 Insecure Design | Fail closed: only the six allow-listed own keys are read; a missing value fails its card instead of reading as no data | `executive-kpis.test.ts` | — |
| A08 Software or Data Integrity Failures | Each value checked by type and range (whole ≥ 0, finite ≥ 0, 0–100) before display | `executive-kpis.test.ts` | The backend's figures are correct at source |
| A10 Mishandling of Exceptional Conditions | No division by a previous 0; null and failure kept apart; one failed KPI leaves the other five and the charts standing | `executive-kpi-strategies.test.ts`, `kpi-card.test.tsx`, `kpi-cards.test.tsx` | — |

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
   meant for `<Suspense key={months} fallback={<KpiCardsSkeleton />}>`: a new key remounts the
   boundary, so the skeleton shows on each range change. **Still to verify in a browser** once
   SCRUM-313's page is merged (see below); the bundled Next 16.4.3 docs do not state this behaviour
   directly.

## Not done yet: waits on SCRUM-313

SCRUM-313 owns `/admin/dashboard`, its URL parsing and its loader, and is not merged into the PBI-24
integration branch yet. Once it is, a small wiring step:

- `lib/executive-dashboard.server.ts`: also return the answer's raw `kpis` block.
- `app/admin/dashboard/page.tsx`: `RangeHeader` (period from `monthLabel` of the first and last
  month, options from `RANGE_MONTHS` and `dashboardHref`), then
  `<Suspense key={state.months} fallback={<KpiCardsSkeleton />}><KpiSection … /></Suspense>` above the
  charts.
- The browser spike for learning 3, plus page tests for `?range=` injection, the A02 `no-store`
  request and `force-dynamic`.
