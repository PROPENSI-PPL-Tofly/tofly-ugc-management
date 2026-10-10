**Mini Sprint Report — SCRUM-144: Content Plan Page (PBI 5)**

**Branch:** `feat/build-content-plan-page_144` · **Period:** 2026-10-10 · **PR:** pending

---

**Subtask Completed**

**[Content Plan page — SCRUM-144]** Replaced the per-creator Content Plan link and the submission queue with one cross-creator Content Plan page at `/admin/content-plan`. The page lives in the URL: four status tabs (Semua / Perlu Approval / Menunggu Kreator / Selesai) map onto the six lifecycle statuses, a filter bar (debounced search, creator multi-select, type multi-select, status multi-select scoped to the active tab, overdue and period selects with a custom from/to range, and a Reset that keeps the tab) writes every choice back to the address, and a sortable deadline table (farthest first by default) opens the existing Content Detail panel through a `?content=<id>` deep link. Counters follow search/creator/type/overdue/period (never the status multiselect, so the tab totals stay honest); Perlu Approval's counter turns red past zero and ignores the period filter, showing "Periode tidak berlaku di tab ini"; Selesai hides the status and overdue filters. The list loads from the 5.1 contract (`GET /contents?...&counts={all,action,waiting,done}`) with a retry path that re-requests the exact URL after a failure and refetches past the last page when a filter change invalidates it. The old `/admin/submissions` address now `permanentRedirect`s to `?tab=action`, and the superseded submission-queue stack (queue table, submissions filter bar, `lib/submissions.ts`, 1 208 lines) is retired. No backend work — 5.1's placeholder endpoint is consumed as agreed.

---

**1. TDD & Code Coverage**

*   **TDD:** strict Red-Green, **23 commits (11 RED, 11 GREEN, 1 REFACTOR)** in 11 pairs + 1 gate-cleanup commit:
    *   RED `81f74aa` → GREEN `28218ce` — pure tab contract: status mapping, parse/build/href helpers
    *   RED `7d36f0b` → GREEN `4e04d8f` — server loaders: the list from the contents endpoint with the session cookie, the creator filter's names
    *   RED `fb4a0f0` → GREEN `0aa6f90` — reusable multi-select filter chips (N dipilih, one chip per pick)
    *   RED `a30f548` → GREEN `68af849` — sortable deadline column header (announces direction, reverses on click)
    *   RED `e87b39d` → GREEN `811e46d` — four status tabs, red counter only on Perlu Approval when it counts
    *   RED `b7d1e13` → GREEN `5f662c4` — filter bar: debounced search, tab-scoped status, tab-keeping reset
    *   RED `6854b65` → GREEN `e5b0f0b` — plan table: status wording, tags, revision count per row
    *   RED `c376566` → GREEN `d4a2e6f` — board: `?content=` deep link and deadline sort in the URL
    *   RED `59e5cdb` → GREEN `dbeacab` — tab bar: moves tabs in the URL, keeps the search, drops the tab's leftovers
    *   RED `b33230a` → GREEN `943e122` — page: loads the list, keeps filters in links, retries the same URL
    *   RED `16849c1` → GREEN `655404d` — `/admin/submissions` redirects; the old submissions stack is dropped
    *   REFACTOR `cf2a6bf` — last lint warnings closed; every new branch covered
*   **Coverage:** frontend **1 094 tests / 81 files pass**, statements/branches/functions/lines all at **100 %** (1 727 / 1 176 / 474 / 1 606) — every new file fully covered; `eslint` clean, `tsc --noEmit` exit 0, `npm run build` succeeds. Backend untouched this subtask (DoD-3 perf belongs to 5.1's endpoint; DoD-4/DoD-5 are team-level — flagged honestly).
*   **Scope:** positive (tab change rewrites the URL keeping the search and dropping the tab's leftovers, filter change writes its parameter and resets the page, sort toggle replaces rather than stacks history, Reset keeps the tab, panel opens from a `?content=` deep link and closes by removing it), negative (unknown tab/sort/period/overdue values fall back to the defaults, malformed page numbers fall back to 1, a load failure shows a retry that re-requests the exact same URL, a page past the end refetches instead of showing a wrong empty state), edge (empty-list wording per tab vs. filtered-empty wording, deadline sort announced to screen readers, action-tab counter ignores the period filter and says so)

---

**2. OO & SOLID Principles**

*   **Single Source of Truth (DRY)** — `CONTENT_PLAN_TABS` is one table of `{key, label, statuses, urgent, counter}`; the tab bar, the counters, the status multiselect's choices and the URL contract all read from it. Adding a fifth tab is a data edit, not a component edit (OCP).
*   **Pure / Server split (SRP, DIP)** — `lib/content-plan.ts` holds the contract with no `next/headers`, so client components share it; `lib/content-plan.server.ts` owns the session-cookie fetch behind a loader port; every test injects a stub without mocking modules.
*   **Adapter** — `parseContentPlanParams` / `buildContentPlanQuery` / `hrefContentPlan` translate between the URL and the typed state once; nothing else touches `URLSearchParams` semantics (validation, first-value-wins, defaults).
*   **Strategy-ish tab scoping** — `tabDef(tab)` and `statusInTab(tab, status)` are pure predicates; the filter bar asks the active tab which filters exist, instead of hard-coding per-tab JSX.
*   **Hook reuse (DRY)** — the search debounce (300 ms, 100-char cap) and `setParam` (which drops `?page=`) come from the existing `useUrlFilters()`; the multi-select is one reusable component serving creator, type and status.
*   **Open/Closed on the board** — the panel is mounted through the existing `?content=` deep-link convention from SCRUM-155; nothing in the panel changed.

---

**3. Development Discipline & Git Flow**

*   23 descriptive commits on `feat/build-content-plan-page_144` (cut from `feat/pbi-6-content-detail` @ `bab17df`, the PR #79 merge), all 2026-10-10, no force-pushes; `[RED]`/`[GREEN]` convention throughout.
*   Example messages: `b7d1e13` [RED] *Expect the filter bar to write debounced search, tab-scoped status, and tab-keeping reset to the URL* → `5f662c4` [GREEN] *Add the Content Plan filter bar writing every filter to the URL*.
*   Tests were not run per commit (per instruction); all gates ran once at the end and drove `cf2a6bf`.
*   PR to the PBI-6 line pending push; base branch to confirm with the team.

---

**4. Team Development Management & Peer Review**

*   Contract with 5.1 locked before coding (`GET /contents?tab=&q=&creator=&type=&status=&overdue=&period=&from=&to=&sort=&page=` → `{items, total, totalPages, counts}`), so this subtask never waited on the backend merge; it consumes the placeholder endpoint as agreed.
*   Deep-link (`?content=`), panel (`onDecided` reload hook) and status vocabulary were reused from SCRUM-155/146 without modification — one panel, one status map, no forks.
*   The old submission queue was retired in the same PR rather than left to rot: the address redirects permanently and the nav says "Content Plan", so no link or bookmark strands.
*   PR review not yet started — branch is local.

---

**5. Code Quality**

*   Frontend `eslint` clean, `tsc --noEmit` exit 0, `npm run build` succeeds (all admin routes build; `/admin/submissions` is now a dynamic redirect route).
*   1 094 tests / 81 files, 100 % statements/branches/functions/lines — the strictest gate the repo has held on this branch.
*   No config/env changes; no backend, database or CI changes.
