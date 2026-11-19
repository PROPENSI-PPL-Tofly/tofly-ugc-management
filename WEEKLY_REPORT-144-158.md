**Weekly Summary Report**

**Subtasks Completed This Week**

**[Content Plan Page — SCRUM-144]** Built the cross-creator Content Plan page for admins: `/admin/content-plan` with status tabs and live counters (Semua / Perlu Approval / Menunggu Kreator / Selesai), a filter bar (search, creator/type/status multi-selects, deadline period, overdue) synced to URL params, server-side pagination of 10 rows, and `?content=` deep links that open the Content Detail panel. Post-review rework made the page speak the real `GET /contents` contract through one translation module (`content-list-api.ts`) and isolated the creator-name fetch so a failed names request costs the filter's choices instead of the whole page, with names fetched fifty at a time and later pages in parallel. Delivered on `feat/build-content-plan-page_144`, PR #82 merged into `feat/pbi-5-content-plan`.

**[Rate & Invoicing Table — SCRUM-158]** Built the Rate & Invoicing table at `/admin/invoicing`: one row per creator showing Fixed Rate, Konten Tambahan, Bonus, Penalti, Final Rate and the running invoice state (`accruing → finalized → creator_acked → payment_uploaded → paid`), with a filter bar (creator name search, contract state, invoice state), always-visible pagination of 10 rows, and the rule that a performance bonus whose data is not in yet reads "Menunggu data" in both the Bonus and the Final Rate column — never `Rp0`. The table is structured exactly as the module 1 prototype structures it (column widths, cell anatomy) in the app's own design tokens, and reads through one typed seam (`invoice-api.ts`, `RawInvoiceList`) whose fixture stands in for 8.3's unbuilt `GET /invoices` — so the page ships ahead of its dependency and only the server body changes when the endpoint lands. Delivered on `feat/rate-invoicing-table_158`, PR #95 (open at the time of writing).

---

**1. Test-Driven Development & Code Coverage (CPL 6)**

*   **TDD Process:** Followed strict Red-Green-Refactor cycle for **49** commits across the two subtasks:
    *   **21 RED commits** — failing tests written first for: the Content Plan tab/status mapping and URL parsing, the page loading from the 5.1 endpoint, the API translation of tabs, multi-select filters, period and sort (144); the creator-fetch isolation and the one-large-page/parallel-names behaviour (144); rupiah amounts, checked filter state and the table's amount wording (158), the `GET /invoices` query/response seam (158), the invoicing table and filter bar reading exactly as the prototype reads (158), and the page's title/formula/counting/retry behaviour (158)
    *   **21 GREEN commits** — minimum implementation to pass: `content-list-api.ts` + `jakartaDay` + `content-plan.server.ts` wiring (144), `Promise.allSettled` page isolation + `fetchCreators` page size + parallel name paging (144); `invoice.ts`, the `invoice-api.ts` seam with its fixture endpoint (158), `InvoiceTable` + `InvoiceFilters` in the prototype's structure and the app's colours (158), and the `/admin/invoicing` page + admin nav entry (158)
    *   **1 REFACTOR commit** — `cf2a6bf` closed the last lint warnings and covered every branch of the new Content Plan files
    *   (plus 6 `test`/`docs` commits — coverage-gap tests and planning-note hygiene — and 7 contract-translation commits cherry-picked from a teammate's branch with authorship preserved, as the agreed fix for the PR #82 review)
*   **Test Coverage Level:**
    *   Backend: N/A this week — both subtasks are frontend-only (the `GET /contents` contract came from PR #80, and `GET /invoices` does not exist yet and is fixture-backed)
    *   Frontend: **100% statements, branches, functions and lines on every file introduced this week** (17 files for SCRUM-158; the Content Plan stack plus its review rework for SCRUM-144); whole frontend suite at **100% on all four metrics** (118 files, 1,981 tests), far above the 80% CI threshold — the brief 99.74% branch gap was closed with tests only (fixture query fallbacks), never with coverage suppressions
*   **Scope of Testing:** Positive tests (tabs render with counters; rows render with amounts, pills and the "Kontrak …" sub-line; a fetched page paginates at 10 rows); negative tests (fetch failure → retry link keeping the URL, creator-names failure → page still renders with an empty creator filter, unknown `contract`/`status`/`page` values in the address fall back to defaults before the API is asked); edge cases (page past the end shows the last page instead of an empty table, repeated search params take the first value, zero amounts read as a dash, a waiting bonus reads "Menunggu data" in two columns and never as `Rp0`, the fixture accepts a query that names no page, the past-end refetch itself failing shows the error panel)
*   **PR Links:** [#82 (SCRUM-144)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/82) · [#95 (SCRUM-158)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/95)
*   **Example of TDD:**
    *   [`710dc59` [RED] Expect the Content Plan fetch to speak the API's words and hand the page its own back](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/710dc59)
    *   [`948b322` [GREEN] Send the Content Plan query through the API translation and map its answer](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/948b322)
    *   Matching pairs also used for the other units: [`45326f7` [RED] · `7f91732` [GREEN] (creator-fetch isolation)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/45326f7) and [`2cf470b` [RED] · `f5cd379` [GREEN] (the invoice seam with its fixture)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/2cf470b) and [`5952a4b` [RED] · `e7a4a67` [GREEN] (rupiah amounts and the table's amount words)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/5952a4b)
*   **Corner Cases:**
    *   **Partial failure must stay partial:** a creator-names fetch failure may not take down the page — `Promise.allSettled` keeps the table and leaves the creator filter empty, while a plan failure still shows the retry panel ([`45326f7`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/45326f7) / [`7f91732`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/7f91732))
    *   **A page past the end:** an old link shows the last page, never an empty table that claims there is no content — and if even that refetch fails, the error panel appears ([`82ab4e2`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/82ab4e2))
    *   **Mock drift is a test bug:** the fixture's answer keys are asserted equal to the API's field set, and mocks equal the real response where raw answers enter — the failure mode found in review (green suite, broken integration) is designed out ([`2cf470b`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/2cf470b), [`725b935`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/725b935))
    *   **A waiting bonus is not a zero:** `bonusAmount: null` renders "Menunggu data" in the Bonus and the Final Rate column — showing `Rp0` would claim a bonus was measured at nothing ([`e7a4a67`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/e7a4a67))
*   **Coverage:**
    *   SonarQube: Quality Gate passed for `tofly-ugc-management frontend` on PR #82
    *   Local: 118 files / 1,981 tests / 100% statements, branches, functions, lines (`npm run test:cov`)

---

**2. Programming Best Practices, OO & SOLID Principles (CPL 6)**

*   **Principles / Patterns Applied:** Single Responsibility Principle (one module owns the wire vocabulary), Dependency Inversion (time and endpoints injected, not read inside), Open/Closed (label and mapping tables), DRY (shared pure helpers and UI primitives), Adapter pattern (API ↔ page translation)
*   **Implementation Details:** Each library owns one concern — `content-list-api.ts` only translates between the page's words and `GET /contents`'s words, `invoice-api.ts` only owns `RawInvoiceList` and its mapping, `invoice.ts` only owns URL state and the table's wording, `invoice.fixture.ts` only stands in for the missing endpoint — while components own presentation only (`InvoiceTable` renders, `InvoiceFilters` syncs URL state). The seam is the DIP boundary: `fetchRateInvoices` depends on the contract, not on HTTP — when 8.3's endpoint lands, only its body changes (`f5cd379`). Time is passed in as an argument (`jakartaDay(now)`, `toContentListQuery(state, jakartaDay())`) so period ranges are tested across midnight WIB without mocking clocks. OCP shows in `Record` mapping tables (`INVOICE_STATUS_LABELS`, `CONTRACT_STATUS_LABELS`, tab/sort/overdue maps): a value added to the lifecycle fails to compile until its API name and label are given. DRY shows in the shared `search-params.ts` helpers (`single()`, `oneOf()`, `pageNumber()`), the shared `Pagination`/`FilterSelect`/`SearchBox`/`Pill`/`StatusDot` primitives, and the prototype-structure table built from one `WIDTHS` array rather than hard-coded cells.
*   **Commit Links:** [`77e3e2c`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/77e3e2c) (translation tables + refused values dropped at the seam), [`f5cd379`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/f5cd379) (injectable invoice seam + fixture), [`4fb70e0`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/4fb70e0) (`jakartaDay` with time passed in)

---

**3. Development Discipline & Git Flow (CPL 6)**

*   **Git Flow Adherence:**
    *   Created feature branch `feat/build-content-plan-page_144` from `feat/pbi-5-content-plan` and `feat/rate-invoicing-table_158` from `feat/pbi-8-calculate-invoice`
    *   49 descriptive commits following [RED]/[GREEN]/[REFACTOR] convention (21 RED, 21 GREEN, 1 REFACTOR) + 6 `test`/`docs` commits
    *   Commits made across the sessions 2026-10-10 → 2026-10-13 (144: 10 Oct 19:58 → 11 Oct 01:58 WIB; 158: 13 Oct 22:27 → 22:58 WIB); only one forced push, on the 158 feature branch and only to remove an accidentally committed personal-file commit (`some changes from pbi-4`, 5,875 lines of notes/prototype HTML) — announced and approved before the rewrite, with the files kept on disk and the branch verified green afterwards
    *   Merge requests created to the integration branches: **PR #82 merged** into `feat/pbi-5-content-plan` (11 Oct 14:41 WIB), PR #95 open
    *   Where a teammate's contract-translation work already existed for the PR #82 review fix, it was **cherry-picked with authorship preserved** and the teammate was coordinated with so his rebase drops the now-identical commits instead of re-implementing his work
*   **Descriptive Commit Messages:**
    *   `710dc59` [RED] Expect the Content Plan fetch to speak the API's words and hand the page its own back
    *   `45326f7` [RED] Expect a failed creator-name fetch to cost the filter choices, not the whole Content Plan
    *   `a18e27f` [GREEN] Fetch creator names fifty at a time, later pages in parallel
    *   `cf2a6bf` [REFACTOR] Close the last lint warnings and cover every branch of the new Content Plan files
    *   `f5cd379` [GREEN] Translate the invoice list through one seam, with a fixture standing in for 8.3's endpoint
*   **Pull Request Links:** https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/82 · https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/95

---

**4. Team Development Management & Peer Review (CPL 3)**

*   **Assigned Issues:** SCRUM-144 (Build the cross-creator Content Plan page, PBI-5 subtask 5.2), SCRUM-158 (Build the Rate & Invoicing table, PBI-8 subtask 8.4)
*   **Code Review Conducted:** Conducted a deep peer review of the teammate's PR #91 (SCRUM-139, hierarchical creator detail endpoint): line-by-line check against the PBI-4 acceptance criteria plus a local run of his backend suite (which surfaced a stale generated Prisma client as an environment pitfall for the team). The review found, rather than rubber-stamped, a page-breaking merge-drift bug — the frontend adapter still read `contractHistory[].contents` after the backend follow-up removed nested contents, which would have failed the Creator Detail page for every creator with a contract while the test suite stayed green on stale fixtures — plus a fixed rate fetched but never displayed and two literal AC mismatches ("contracts newest first", "content nested inside"). Delivered as a step-by-step TDD fix plan with a contract-shape seam test and a verification checklist; the plan was executed and the branch merged with the crash fixed. On my own PR #82, a reviewer's two findings (API contract mismatch, creator-fetch failure domain) were answered with the fixes above and the review thread closed with evidence per finding; a third teammate (PR #83) was coordinated with for the cherry-pick/rebase overlap so his multi-select work continues from a clean base.
*   **Reviewed Merge Request Links:** [#91](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/91) · [#82](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/82) · [#83](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/83)

---

**5. Code Quality Measurement (CPL 6)**

*   **SonarQube / Code Quality Results:**
    *   Frontend: 0 issues, 0 vulnerabilities, 0 code smells; SonarCloud Quality Gate **passed** on PR #82
    *   Both subtasks pass the 80% line coverage threshold enforced by CI — held at **100% statements, branches, functions and lines** locally (118 files, 1,981 tests) at both PR heads; lint clean and `tsc --noEmit` clean on both branches
*   **Proof of Quality:** [placeholder]

---

**6. Security Awareness (CPL 6)**

*   **Security Controls Applied:**
    *   **Parse-boundary validation of the address:** every URL state is checked in the pure layer before any request is built — `oneOf()` rejects a status/contract from another world, `isUuid()`/`pageNumber()` reject hand-typed garbage, and repeated params take the first value — so a crafted address falls back to defaults instead of reaching an API that would only answer 400 (OWASP A03)
    *   **Refused values are dropped at the seam:** the translation layer caps filters at 50 values and a search at 100 characters, and only forwards query words the `GET /contents` contract accepts (`77e3e2c`) — the page cannot be used to probe the API with an invented vocabulary
    *   **No secret leakage:** `BACKEND_URL` and the browser's session cookie are read server-side only (server modules behind `next/headers`), so the backend address and credentials never reach the browser bundle; response rows are rendered as text (names typed into a content name are shown, never run)
    *   **Honest failure surfaces:** a failed request shows a retry panel with the URL kept, a missing resource shows the not-found path, and a data state that is not measured yet reads "Menunggu data" instead of a fabricated amount — errors and unknowns are distinguished rather than blurred
*   **Vulnerability Mitigations:**
    *   OWASP A03 (Injection): `URLSearchParams`-built queries, `encodeURIComponent` on ids in deep links, enum whitelists, and length caps block path/query injection through the URL state
    *   OWASP A05 (Security Misconfiguration) / information disclosure: backend address kept out of the browser; test/fixture shapes assert the API's real field set so a response change fails the build instead of silently rendering wrong data
    *   OWASP A10 (Server-Side Request Forgery): every server-side fetch takes its host exclusively from `process.env.BACKEND_URL` with a fixed path template; user input is confined to validated query values, and the one placeholder fetch (`invoice.server.ts`) takes no network input at all until 8.3 lands
    *   OWASP A01 (Broken Access Control): the Content Plan and Rate & Invoicing reads are admin-gated views whose session cookie is forwarded server-side; a page past the end and an unknown filter value degrade to safe defaults rather than widening the result set
*   **Commit Links:**
    *   [`77e3e2c`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/77e3e2c) — translates the page's filters into the API's contract and drops what the API would refuse, with caps (A03)
    *   [`5952a4b`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/5952a4b) — parse-boundary tests: unknown contract/status fall back to `all`, invalid pages to page 1 (A03)
    *   [`f5cd379`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/f5cd379) — the invoice fetch is fixture-backed and takes no user-controlled host until 8.3 lands (A10)
    *   [`82ab4e2`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/82ab4e2) — failed refetch shows an honest error panel rather than an empty table (A05)

---

**7. AI Literacy & Productivity (CPL 7)**

*   **AI Tool(s) Used:** OpenCode
*   **Implementation Type:** AI Agents used for code generation, test writing, TDD cycle execution, code review, and git workflow management.
*   **Impact & Proof:**
    *   AI generated 49 commits following strict TDD discipline (21 RED, 21 GREEN, 1 REFACTOR) across two subtasks, with lint + tsc + 100% coverage + build verified as one finish gate per push — PR #82 merged, PR #95 green and awaiting review.
    *   The AI handled three pieces of complex work: (1) the API contract seam for SCRUM-144 — translating the page's vocabulary into `GET /contents`'s contract (tab names, period → `deadlineFrom`/`deadlineTo` from Jakarta's calendar day, overdue yes/no → true/false) after a review showed the mocks had drifted from the real response, and re-working the fetch layer into `Promise.allSettled` failure domains with `pageSize=50` parallel name paging under a 200-name budget; (2) the typed placeholder seam for SCRUM-158 — agreeing `RawInvoiceList` with the teammate who will build `GET /invoices` before his work starts, so the table shipped ahead of its dependency with a drift-guard test locking the fixture to the API's field set; (3) a deep review of a teammate's PR #91 that found a page-breaking merge-drift bug the green test suite hid, delivered as a step-by-step fix plan that was executed and merged. It also coordinated a cherry-pick/rebase with a third teammate and cleaned an accidentally committed personal-file commit from the PR history on request.
    *   Estimated 70% time reduction compared to manual TDD implementation.
