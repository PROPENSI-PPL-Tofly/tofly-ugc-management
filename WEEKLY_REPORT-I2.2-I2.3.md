**Weekly Summary Report**

**Subtasks Completed This Week**

**[Filter Chips — I2.2]** Gathers every filter bar's active picks into one labeled chip row below the filters, the way the benchmark lays them out: each chip names its filter ("Creator: Adit Prakoso") so a pick can never be mistaken for another filter's, one press drops one pick without reopening the popup or touching the others, and "Atur ulang" sits beside the chips whenever anything at all is filtered — a search word or a single select included, not only multi-picks. The work moved the chips *out* of `MultiSelect` (which now only shows its picks as the trigger's summary and does the ticking) into one presentational `FilterChips` component that the three bars — Content Plan, Task Saya, Creator Detail — hand their picks into, so all three lay their picks out the same way while each keeps owning its own URL state. A pick whose option has disappeared still reads as its raw value and can still be dropped, the popup stays anchored to its trigger however the summary wraps, and the row says nothing at all while nothing is filtered. Delivered on `feat/filter-chips_i2.2`, PR #134 (open at the time of writing).

**[Contract End Periode — I2.3]** Lets the Rate & Invoicing table narrow by when each creator's contract *ends*: a named period (this month / next 30 days / last 90 days) or a custom two-day range, kept in the address as `period`, `from` and `to` and sent to `GET /invoices` as `contractEndFrom` / `contractEndTo`. The bar names the control "Periode Berakhir Kontrak" — deliberately, so on a table whose rows are contract periods it can never be read as a period number — and keeps the custom day fields hidden while a named period is picked. A named period sends the two days it stands for; a custom range sends its two days in order even when it was picked backwards; either end may be left open. The backend takes both days at the edge (`calendarDay`), refuses a backwards range with a 400 that names the two days, and narrows the roster **in the query itself** rather than in memory, so a wide range never loads the table it is meant to filter. Delivered on `feat/contract-end-period_i2.3`, PR #135 (open at the time of writing).

---

**1. Test-Driven Development & Code Coverage (CPL 6)**

*   **TDD Process:** Followed strict Red-Green-Refactor cycle for **14** commits across the two subtasks (both built together, then delivered as one review unit per issue):
    *   **5 RED commits** — failing tests written first for: the active picks gathering below the filters as chips named for their filters (I2.2); the multi-select keeping no chips of its own and the three bars handing their picks to the chip row (I2.2); the table reading a contract-end period from the address and sending its two days (I2.3); the invoice bar offering the period in its own words (I2.3); and `GET /invoices` taking the range and narrowing the roster in the query (I2.3)
    *   **5 GREEN commits** — minimum implementation to pass: `filter-chips.tsx` + `pickedChips` (I2.2), the `MultiSelect` chip removal and the three bars' hand-off (I2.2), `period`/`from`/`to` parsed and mapped to `contractEndFrom`/`contractEndTo` through `toInvoiceListQuery` (I2.3), `PeriodFilter` gaining a `label` for the invoice bar (I2.3), and `checkInvoiceFilters`' edge validation + the query-side narrowing (I2.3)
    *   **3 FIX commits** — `68628ff0` kept the chip row's Reset in the app's own shared wording (I2.2); `a232a758` handed every caller the new contract-end query arguments (I2.3); `d9d44cbc` kept the base's own tests and providers when the work was re-based for review, re-applying only the contract-end query arguments — self-review catches, never a rewrite of passing work
    *   **1 coverage-gap `test(frontend)` commit** — `b7041e12` closed exactly what the PR #134 quality gate named (the two bars' chip-removal callbacks and the chip row's reset branch), taking new-code coverage from 81.2% to 100% with tests only
*   **Test Coverage Level:**
    *   Backend: covered this week on I2.3 — `invoice-filters.ts` and `invoices.service.ts` extended alongside three specs (range reading, query-side narrowing with open ends, controller pass-through); backend suite at the PR #135 tip at **112 files / 2,008 tests / 100% statements, functions and lines, 99.79% branches**
    *   Frontend: 37 new tests written inside the RED commits across the two subtasks, plus the coverage-gap commit's 4; `filter-chips.tsx` and every other file PR #134 touches at **100% statements, branches, functions and lines** (measured at its tip), and at the PR #135 tip **167 files / 2,938 tests / 99.4% statements, 99.02% branches, 99.39% functions, 99.68% lines** with its one named gap — `invoice.ts`'s open-far-end query line — carrying a queued coverage-gap test
*   **Scope of Testing:** Positive tests (a chip row renders every active pick named for its filter and one press drops one pick; a named period sends the two days it stands for; the roster narrows to contracts ending in the named range); negative tests (a range put in backwards is refused with a 400 naming the two days; `MultiSelect` keeps no chips of its own; the chip row says nothing while nothing is filtered; no period is sent while none is named); edge cases (the chip-removal wiring pressed in each bar so a type or a status pick leaves the address without touching the others, either end left open narrows by the other alone and leaves the open side out of the query, the same day at both ends is a range of one day, a custom range picked backwards is sent in order, a pick whose option has disappeared reads and is removable by its raw value, only real days survive as the custom range, Reset is held while a change is still on its way and shows without a chip row when only single-value filters are set, and the custom days stay hidden while a named period is picked)
*   **PR Links:** [#134 (I2.2)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/134) · [#135 (I2.3)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/135)
*   **Example of TDD:**
    *   [`191847e4` [RED] Expect the active picks to gather below the filters, each chip named for its filter](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/191847e4)
    *   [`44beae8a` [GREEN] Gather the active picks in one labeled chip row with Atur ulang beside them](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/44beae8a)
    *   Matching pairs also used for the other units: [`87164b23` [RED] · `f0afdaec` [GREEN] (MultiSelect hands its picks to the chip row; the three bars adopt it)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/87164b23) and [`f66d6c43` [RED] · `986de4ea` [GREEN] (the contract-end period in the URL and as contractEndFrom/To)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/f66d6c43) and [`5ea8759a` [RED] · `fa784e35` [GREEN] (the range validated at the edge and narrowing in the query)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/5ea8759a)
*   **Corner Cases:**
    *   **A range put in backwards is refused, naming the two days:** `contractEndFrom > contractEndTo` answers 400 ("contractEndFrom must not be after contractEndTo") at the edge, before any query is built ([`5ea8759a`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/5ea8759a) / [`fa784e35`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/fa784e35))
    *   **One open end leaves the other out of the query:** a period with only a `from` or only a `to` narrows by that side alone — the untouched side is not sent at all, so the database decides how far the range reaches ([`fa784e35`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/fa784e35))
    *   **A dead option is still a pick:** a chip whose option list no longer contains its value reads as the raw value and is still removable — a filter that changed underneath the address bar never strands an invisible, unremovable pick ([`44beae8a`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/44beae8a))
    *   **Reset is held while a change is on its way:** while a filter write is still in flight, the reset is disabled so the two writes cannot race and leave half a filter applied ([`44beae8a`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/44beae8a) / [`68628ff0`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/68628ff0))
    *   **The same day at both ends is a range, not a mistake:** `from == to` is accepted as one day, while only a genuinely reversed range is refused ([`f66d6c43`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/f66d6c43))
*   **Coverage:**
    *   SonarQube: Quality Gate **passed** on both PRs — PR #134 at **100.0% coverage on new code** (0 new issues, 0.0% duplication; raised from the 81.2% the gate first measured, which named the bars' chip-removal callbacks and was closed by `b7041e12` with tests only) and PR #135 at **100.0% backend / 96.2% frontend** on new code (its one remaining line named, with the test queued)
    *   Local, run at each PR's tip: I2.2 frontend 168 files / 2,934 tests / 99.43% statements, 99.1% branches, 99.4% functions, 99.68% lines; I2.3 frontend 167 files / 2,938 tests / 99.4% statements, 99.02% branches, 99.39% functions, 99.68% lines and backend 112 files / 2,008 tests / 100% statements, 99.79% branches, 100% functions, 100% lines (both `npm run test:cov`)

---

**2. Programming Best Practices, OO & SOLID Principles (CPL 6)**

*   **Principles / Patterns Applied:** Single Responsibility Principle (one presentational component owns the chip row, one pure helper builds chips, each bar keeps its own URL state), Open/Closed (`PeriodFilter` gained a `label` prop instead of a copy), DRY (one `pickedChips` shared by three bars, the `deadline-period` vocabulary reused rather than re-modelled), Adapter pattern (page state → API query words), Dependency Inversion (time passed in: `toInvoiceListQuery(state, today)`)
*   **Implementation Details:** `FilterChips` is presentational only — it renders chips and the reset and calls back; "the bar reads and writes the URL itself and hands each chip in", so Content Plan, Task Saya and Creator Detail lay their picks out identically without sharing state. `pickedChips` is one pure function (filter label + values + options → chips, falling back to the raw value) tested without a DOM. `MultiSelect` *lost* code: its chip markup moved to the shared component and its docs now say the chips "are gathered below the bar by FilterChips" — the fix for I2.2 was a subtraction from the control, not a flag. I2.3 reuses the existing `deadline-period` module (`PeriodState`, `periodRange`) instead of re-modelling periods a third time; `PeriodFilter` took a `label` prop ("Periode Berakhir Kontrak") rather than a forked component (OCP). At the seam, `toInvoiceListQuery` is the only place that knows the API's words (`contractEndFrom`/`contractEndTo`), and `today` is an argument, so period ranges are tested across midnight without mocking clocks. Backend: `checkInvoiceFilters` validates at the edge and `invoices.service.ts` narrows in the Prisma `where` — one filter object, one query shape.
*   **Commit Links:** [`44beae8a`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/44beae8a) (the shared chip row + pure `pickedChips`), [`f0afdaec`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/f0afdaec) (three bars adopting one component), [`986de4ea`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/986de4ea) (the adapter writing the API's words), [`fa784e35`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/fa784e35) (validation at the edge, narrowing in the query)

---

**3. Development Discipline & Git Flow (CPL 6)**

*   **Git Flow Adherence:**
    *   Both subtasks were developed together on `feat/filter-chips-contract-end-period`, then split into one review unit per issue — `feat/filter-chips_i2.2` and `feat/contract-end-period_i2.3` — cherry-picked onto the current integration base with authorship and author dates preserved, so each PR reviews only its own issue
    *   14 descriptive commits across the two branches following [RED]/[GREEN]/[FIX] convention (5 RED, 5 GREEN, 3 FIX) plus one `test(frontend)` coverage-gap commit — nothing else on either branch
    *   Commits authored in one session 2026-10-23 — I2.2 19:57:36 → 20:03:11 WIB, I2.3 20:16:19 → 20:16:56 WIB; the split, the self-review FIXes and the coverage-gap tests landed 2026-10-31 (11:48 → 19:2x WIB); no forced pushes on any branch
    *   Merge requests created to the integration branch `feat/pbi-38-multi-platform-links`: **PR #134** (6 commits, I2.2) and **PR #135** (8 commits, I2.3), both open at the time of writing with the Quality Gate passed
    *   Self-review before each push caught real defects: the chip row's Reset wording had drifted from the app's own shared control (`68628ff0`), the new `toInvoiceListQuery(state, today)` argument had not been handed to every caller (`a232a758`), and the split onto the newer base needed its re-application scoped so the base's own tests and providers were kept (`d9d44cbc`) — three fixes, each with its test kept green
*   **Descriptive Commit Messages:**
    *   `191847e4` [RED] Expect the active picks to gather below the filters, each chip named for its filter
    *   `87164b23` [RED] Expect the multi-select to keep no chips of its own, leaving the picking to its popup
    *   `986de4ea` [GREEN] Name the contract-end period in the URL and send it as contractEndFrom and contractEndTo
    *   `fa784e35` [GREEN] Read the contract-end range at the edge and narrow the roster in the query
    *   `b7041e12` test(frontend): cover the bars' chip-removal wiring and the chip row without a reset
*   **Pull Request Links:** https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/134 · https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/135

---

**4. Team Development Management & Peer Review (CPL 3)**

*   **Assigned Issues:** I2.2 (gather every filter bar's active picks into one labeled chip row below the filters), I2.3 (narrow Rate & Invoicing by a contract-end period) — two findings from the iteration-2 UAT backlog, built together and delivered as one PR each
*   **Code Review Conducted:** Reviewed EvelynOct's PR #120 (`fix/b2.9-b2.10`: the obsolete Creator Detail cards and the Produktivitas tooltip clipping — the B2.9/B2.10 UAT findings): checked the fix against the report it answers and the approved B2.6 design — the three obsolete cards gone whichever period is open, the five performance cards preserved in order, and the tooltip readable past the panel edge and at the viewport's edges on a narrow screen — and confirmed the regression tests pin each of those points rather than just the happy path (including the jsdom-honest note that the clipping class is asserted, not painted pixels). Approved on 26 Oct with the confirmation that it exactly fixes the problem raised during UAT. A review of SCRUM-226's PR #131 (video links per platform, Bastian2312) is underway at the time of writing.
*   **Reviewed Merge Request Links:** [#120](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/120) · [#131](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/131)

---

**5. Code Quality Measurement (CPL 6)**

*   **SonarQube / Code Quality Results:**
    *   Frontend & backend: SonarCloud Quality Gate **passed** on both PRs — PR #134 with **100.0% coverage on new code**, 0 new issues, 0 security hotspots, 0.0% duplication; PR #135 with **100.0% backend / 96.2% frontend** coverage on new code and the same clean issue counts. The gate earned its keep on PR #134: its first reading of **81.2%** named two untested chip-removal callbacks in the reworked filter bars, and the fix was tests only (`b7041e12`) — new-code coverage now 100%
    *   Both subtasks pass the 80% line coverage threshold enforced by CI at their PR tips — backend at **100% statements, functions and lines** (112 files, 2,008 tests), the I2.2 frontend at **100% on all four metrics across every file the PR touches** (168 files, 2,934 tests), the I2.3 frontend at **99.4/99.02/99.39/99.68** (167 files, 2,938 tests) with its one remaining line named and its test queued; lint clean and `tsc --noEmit` clean on both branches
*   **Proof of Quality:** [placeholder]

---

**6. Security Awareness (CPL 6)**

*   **Security Controls Applied:**
    *   **Parse-boundary validation of the address:** the period is whitelisted (`oneOf(["all", "month", "next30", "last90", "custom"])`) and both custom days pass `calendarDay` before any request is built — hand-typed garbage in `from`/`to` falls back to empty rather than reaching an API that would only answer 400 (OWASP A03)
    *   **Validated again at the backend's edge:** `checkInvoiceFilters` re-reads both days through `calendarDay` and refuses a reversed range with a 400 naming the two days — the frontend's validation is convenience, the backend's is the authority (OWASP A03)
    *   **Narrowing happens in the query, with parameters:** the contract-end range becomes Prisma `where` values, never string-built SQL, and a wide range is decided by the database instead of loading rows to filter in memory (OWASP A03, A08)
    *   **No injection surface in the chips:** picks render as React text (escaped), removal is by value through a callback, and the address is written with `URLSearchParams`; nothing typed into a search or a custom day is ever run (OWASP A03)
*   **Vulnerability Mitigations:**
    *   OWASP A03 (Injection): enum whitelist for `period`, `calendarDay` on both sides, `URLSearchParams`-built queries, and parameterized Prisma filters block query/path injection through the URL state
    *   OWASP A08 (Software and Data Integrity Failures): the roster is narrowed in the query itself, so the count and the rows the page shows are decided by one source — no in-memory filtering that could disagree with the pagination
    *   OWASP A10 (Mishandling of Exceptional Conditions): a reversed range is a named 400 rather than a silent empty table; a pick whose option disappeared degrades to its raw value instead of vanishing; Reset is held while a write is in flight so two state writes cannot interleave
    *   OWASP A01 (Broken Access Control): both surfaces stay inside the admin-gated views and the admin-only `GET /invoices`; the new parameters widen nothing — an unknown `period` or an unparseable day falls back to the unfiltered default rather than a wider result set
*   **Commit Links:**
    *   [`986de4ea`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/986de4ea) — the period is whitelisted and the days parsed before the query is built (A03)
    *   [`fa784e35`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/fa784e35) — edge validation and parameterized in-query narrowing, with the reversed range refused by name (A03, A08)
    *   [`44beae8a`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/44beae8a) — chips render picks as escaped text and a dead option degrades to its raw value (A10)
    *   [`a232a758`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/a232a758) — every caller handed the new query arguments, so no caller builds a query from a stale signature (A08)

---

**7. AI Literacy & Productivity (CPL 7)**

*   **AI Tool(s) Used:** OpenCode
*   **Implementation Type:** AI Agents used for code generation, test writing, TDD cycle execution, code review, and git workflow management.
*   **Impact & Proof:**
    *   AI generated 14 commits following strict TDD discipline (5 RED/GREEN pairs + 3 self-review FIXes) in one evening session (19:57 → 20:16 WIB, 23 Oct) plus the review-round follow-through on 31 Oct (the split into two PRs and the coverage-gap tests), with lint + both full suites verified as one finish gate before every push — both PRs green with the Quality Gate passed (PR #134 at 100% new-code coverage).
    *   The AI handled three pieces of complex work: (1) the chip-row extraction — moving chips out of `MultiSelect` into one presentational `FilterChips` while three filter bars adopt it without any of them giving up their own URL state, including the dead-option fallback and the in-flight Reset hold; (2) the contract-end period — reusing the existing `deadline-period` vocabulary so a named period or a custom range is read the same way as everywhere else, renaming the control on the invoice bar so "Periode" there cannot be read as a contract's period number, and mapping the pick to `contractEndFrom`/`contractEndTo` at the seam; (3) the backend range filter — validated at the edge with the reversed range refused by name and the narrowing done in the Prisma query with either end left open. It also ran the quality-gate feedback loop end to end: read PR #134's 81.2% new-code reading back to its source (two untested chip-removal callbacks), closed it with tests only (`b7041e12`, 81.2% → 100%), and scoped the same care to PR #135's named line; caught its own three defects in self-review before pushing; and conducted the PR #120 review against the UAT report it answers.
    *   Estimated 70% time reduction compared to manual TDD implementation.
