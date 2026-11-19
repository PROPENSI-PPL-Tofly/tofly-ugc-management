# Sprint [X] Week [Y] Part C - [Student Name]

**Author:** [Student Name] (NPM: [NPM])
**Period:** [Date Range]
**Repository:** https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management

**Scope of this reflection:** PBI-5 / SCRUM-144 (*Build the cross-creator Content Plan page* — branch `feat/build-content-plan-page_144`, PR #82, including the follow-up work from code review) and PBI-8 / SCRUM-158 (*Build the Rate & Invoicing table* — branch `feat/rate-invoicing-table_158`) — 24 commits delivered across the two branches.

---

## 1. Aptitude, Applying Knowledge

This sprint's work sat in the frontend data and list layer, where course material covers ordinary table/page implementation. The items below were learned and applied on top of that baseline because a code review, an unfriendly API contract, and an unimplemented dependency each demanded guarantees the standard approach does not provide.

### 1.1 Contract-seam translation and mock-drift discipline (beyond "call the API and render")

SCRUM-144 had to speak to `GET /contents`, whose query and response use the backend's words (`tab=needs_approval`, `deadlineFrom`/`deadlineTo`, `overdue=true|false`, repeatable `creator`/`type`/`status`) while the page uses its own (`tab=action`, `period=next30`, `overdue=yes`). Instead of scattering conversions, the translation lives in **one pure module**, `frontend/src/lib/content-list-api.ts` (`toContentListQuery` / `toContentPlanResponse`), so an API change stops at that file (commits `8ba9a76` [RED] → `77e3e2c` [GREEN], wired in `948b322`).

Two non-standard lessons came out of this, both prompted by review feedback:

- **Wire shape vs mapped shape in tests.** The reviewer pointed out the test mocks were shaped like the frontend's names while the real response is shaped like the API's. The suite was green against a mock the endpoint never produces. Fixing it established a layering rule: mocks equal the real response where raw answers enter (`content-plan.server.test.ts`), assertions use the mapped names where components consume them (commit `948b322`). The same bug class was then found independently in a teammate's PR during my own review (Section 2.1), which confirms it as a team-level testing pattern rather than a one-off fix.
- **Timezone boundaries as a translation concern.** Period filters ("30 hari ke depan") must count from Jakarta's calendar day, not the server's, so `jakartaDay()` was added and `daysUntil` rebuilt on it (`87d8714` / `4fb70e0`) — a date-handling edge case not covered in class material.

Security-wise, the seam is also the OWASP A03 choke point: values from the address are validated (`oneOf`, `isUuid`, repeatable-param caps of 50) before the query is built, and anything the API would refuse is dropped rather than forwarded (`77e3e2c`).

**Why this goes beyond the standard requirement:** the ticket only asked for a page. What was added is an explicit API-contract boundary with a test-layering discipline — the two failure modes (mock drift, timezone drift) are invisible until integration, and both were designed out up front.

### 1.2 Partial-failure isolation and bounded parallel fetching

The page loads the content plan and the creator filter's names together. A review finding showed that if the names request failed, `Promise.all` let it take down the whole page. The fix separates the two failure domains with `Promise.allSettled`: a creator-name failure costs only the filter's choices (`creators=[]`), while a list failure still costs the page and offers retry (`45326f7` / `7f91732`).

The same fetch walked up to **20 sequential requests** of 10 creators. It now asks for the API's maximum page (`pageSize=50`, the backend's `MAX_PAGE_SIZE`) and fetches the remaining pages **in parallel** with `Promise.all`, capped at the same 200-name ceiling as before (4×50 instead of 20×10) — one request for a normal roster, three parallel at worst (`c0104cd`/`be9d436`, `c11c7b5`/`a18e27f`). This combines structured concurrency with awareness of server-side paging caps — both beyond the standard fetch-and-render pattern.

### 1.3 Building against an endpoint that does not exist yet: a typed placeholder seam

SCRUM-158 (the Rate & Invoicing table) depends on subtask 8.3's `GET /invoices`, which is not implemented. Rather than waiting, the dependency was locked as a **written contract first**: `frontend/src/lib/invoice-api.ts` declares `RawInvoiceList`/`RawInvoiceRow` (including `bonusAmount: number | null` — a waiting bonus must render as "Menunggu data", never as `Rp0`), and `invoice.fixture.ts` stands in for the endpoint behind `TODO(SCRUM-8.3)`. When 8.3 lands, only `invoice.server.ts`'s body changes. A drift-guard test asserts the fixture answers in exactly the API's field set (`2cf470b`/`f5cd379`), applying the mock-drift lesson from 1.1 from day one. The table itself reproduces the prototype's structure exactly (column widths `17/11/11/11/13/11/13/13`, cell anatomy, dash-for-zero) while colours come from the app's own design tokens — a deliberate structure-vs-skin split.

**Why this goes beyond the standard requirement:** placeholdering is usually ad-hoc mock data. Here the placeholder is a typed, test-locked contract shared with the teammate who will implement the endpoint — dependency management, not just scaffolding.

---

## 2. Grow Together, Communication, Knowledge Sharing

### 2.1 A deep review that caught a page-breaking bug before it shipped

I reviewed a teammate's PR #91 (*hierarchical creator detail endpoint*, SCRUM-139) against the PBI-4 acceptance criteria line by line, and ran his backend suite locally to verify his claims (which surfaced an environment issue — a stale generated Prisma client — worth knowing as a team). The review found, rather than rubber-stamped:

- **A merge-drift bug that would break the flagship page at runtime:** the frontend adapter still read `contractHistory[].contents` while the backend follow-up had removed nested contents from the response — the Creator Detail page would fail for every creator with a contract, and the green test suite hid it behind stale fixtures. The same class as 1.1.
- The fixed rate was fetched but never displayed, although the business value of the PBI is contract-renewal decisions.
- Two literal AC mismatches ("contracts newest first", "content nested inside") that reviewers would otherwise flag later.

Instead of "LGTM", I delivered a step-by-step TDD fix plan (RED/GREEN pairs, a contract-shape seam test, and a verification checklist). The plan was executed and the branch merged with the crash fixed.

### 2.2 Cherry-pick over re-implement, and cross-branch coordination

On my own PR #82, a reviewer found the API contract mismatch (Section 1.1) and the fetch issue (Section 1.2). Part of the fix already existed as seven commits on a teammate's branch (`_145`). Instead of rewriting them, I **cherry-picked them with authorship preserved**, then coordinated with the teammate so his rebase auto-drops the now patch-identical duplicates and keeps only his UI commits — no wasted work, no duplicated history, and his review thread (four points from another reviewer) stayed his to handle.

### 2.3 Contract handoff and process knowledge

- Published the `RawInvoiceList` shape in `invoice-api.ts` **before** the 8.3 teammate implements his endpoint, so both sides build against one agreed contract instead of two guessed ones.
- Contributed the team's PR-description template usage for both PRs, including an honest "deviations" section so reviewers see deliberate differences rather than discovering them.
- Diagnosed a CI failure for the team (a test fix that was verified locally but never committed): the lesson "the gates-green run must match the pushed tree" was shared so it is not repeated.

**Impact:** the review in 2.1 caught a production-breaking defect at zero cost; the contract-first handoffs in 2.2–2.3 turned two cross-person dependencies (contract translation, `GET /invoices`) into parallel work instead of serial waits.

---

## 3. Commitment, Work Ethic

### 3.1 Tasks completed on schedule

- **SCRUM-144 — Build the cross-creator Content Plan page** (PBI-5 subtask 5.2): `/admin/content-plan` with status tabs and live counters, full filter bar (search, creator/type/status multi-selects, deadline period, overdue), 10-row pagination, and `?content=` deep links opening the Content Detail panel. Delivered on `feat/build-content-plan-page_144`, [PR #82](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/82); both reviewer findings answered in-PR with the fixes listed above.
- **SCRUM-158 — Build the Rate & Invoicing table** (PBI-8 subtask 8.4): `/admin/invoicing` showing Fixed Rate, Konten Tambahan, Bonus, Penalti, Final Rate and the running invoice state per creator, with filters, 10-row pagination and the "Menunggu data" rule for the unavailable performance bonus. Delivered on `feat/rate-invoicing-table_158` **ahead of its 8.3 dependency**, thanks to the typed placeholder seam (1.3).

### 3.2 Disciplined engineering practice

- **Strict TDD:** 24 commits in RED/GREEN pairs across the two branches (e.g. [`5952a4b` [RED] *Expect rupiah amounts, checked filter state and the table's amount words*](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/5952a4b) → [`e7a4a67` [GREEN]](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/e7a4a67); [`8ba9a76` [RED] → `77e3e2c` [GREEN]](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/8ba9a76) for the API translation), with dedicated `test(frontend):` and `[REFACTOR]` commits (`cf2a6bf`, `82ab4e2`, `725b935`).
- **100% coverage held on both branches:** SCRUM-144 finished at 100% statements/branches/functions/lines; SCRUM-158 finished at 100% on all four metrics (118 files / 1981 tests), far above the 80% CI line — closed with tests only, never with coverage suppressions.
- **Single end-of-task gate discipline:** lint, `tsc --noEmit`, full coverage run and production build executed as one verification pass before every push; both PRs shipped green.

### 3.3 Time log (≈17 hours)

- **Coding & Implementation — 8 hours.** SCRUM-144: the pure content-plan modules (URL state, tabs, counters, filters), the `content-list-api` translation seam, `jakartaDay`, and the page wiring including the past-end-page recovery; post-review rework of the creator fetch (`Promise.allSettled` + parallel `pageSize=50` paging). SCRUM-158: `invoice.ts` state/labels/amount wording, the `invoice-api` seam with its fixture endpoint, the prototype-exact `InvoiceTable`, the filter bar, and the page with its formula tooltip and always-on pagination.
- **Testing (Unit / TDD) — 4 hours.** Writing the RED specs first for every pair (params parsing and OWASP-A03 fallbacks, query translation, amount/penalty/"Menunggu data" wording, table cell anatomy and column widths, filter wiring, page load/retry states); closing branch coverage to 100% (the fixture's query-fallback branches, the past-end refetch failure, the hook-mock typing); and the one finish-run of the full suite per push.
- **Code Reviews & PR write-ups — 3 hours.** The PR #91 deep review against PBI-4 (diff reading, local suite run, the step-by-step fix plan); answering the PR #82 review with evidence per finding and the cherry-pick/rebase coordination with the `_145` owner; and writing both PR descriptions in the team template.
- **Sprint Planning & Meetings — 2 hours.** Sprint planning and subtask breakdown (5.2 / 8.4), and sync discussions with the 8.3/8.5 owners to lock the `GET /invoices` contract and the column-popup hand-off boundary.

**Total: 17 hours.**
