**Title:** `feat(content-plan): open the cross-creator Content Plan page with status tabs`

## Summary

Implements **SCRUM-144 of PBI 5** (Content Plan): one cross-creator Content Plan page at `/admin/content-plan`, replacing the per-creator link and the submission queue. Frontend-only — the list loads from the 5.1 placeholder endpoint (`GET /contents` with tab/q/creator/type/status/overdue/period/from/to/sort/page → `{items,total,totalPages,counts}`), consumed exactly as agreed; no backend work in this subtask.

- **Tab contract in the URL.** `lib/content-plan.ts` (pure, no `next/headers`) maps four tabs onto the six lifecycle statuses — Semua (no filter), **Perlu Approval** (`pending`+`draft_review`, red counter only past zero, ignores the period filter and says "Periode tidak berlaku di tab ini"), **Menunggu Kreator** (`scheduled`+`draft_revision`+`draft_approved`, grey counter always), **Selesai** (`link_submitted`, hides the status and overdue filters). `parseContentPlanParams` / `buildContentPlanQuery` / `hrefContentPlan` are the only place URL semantics live; unknown values fall back to the defaults. `lib/content-plan.server.ts` owns the session-cookie fetch behind a loader port.
- **The page lives in the URL.** Every tab, filter and page number is a parameter, so a view can be linked, bookmarked and reloaded. Tab change keeps the search and drops the tab's leftovers (status/sort/page, `?content=`); filter change writes its parameter and resets the page; Reset keeps the tab; the deadline sort defaults to farthest-first (`desc`) and toggles in place. Counters follow search/creator/type/overdue/period — never the status multiselect, so the tab totals stay honest.
- **Components.** A reusable `MultiSelect` (chips, "N dipilih", one pick per chip) serves creator, type and status; a sortable `DeadlineSort` header announces its direction to screen readers; `content-plan-tabs` / `content-plan-tab-bar` split link-style navigation from counter rendering; the filter bar scopes the status choices to the active tab; the table words each row's status with tags and revision count; the board mounts the existing Content Detail panel through the `?content=<id>` deep link (panel, `onDecided` reload and decision flow unchanged from SCRUM-155).
- **Page shell.** Server component with a retry path that re-requests the exact same URL after a failure, and a refetch when a filter change invalidates the current page (past-the-end guard).
- **Old address retired.** `/admin/submissions` now `permanentRedirect`s to `/admin/content-plan?tab=action`; the nav says "Content Plan"; the superseded stack (`submission-queue-table.tsx`, `submission-filters.tsx`, `lib/submissions.ts` + tests, 1 208 lines) is deleted in the same PR so nothing strands.

## How to Test

1. `cd frontend && npm run lint && npx tsc --noEmit && npm run test:cov && npm run build` — all clean; **1 094 tests / 81 files**, 100 % statements/branches/functions/lines, build succeeds.
2. Start the app (`docker compose up -d db`, migrations/seed per README, `npm run start:dev`, `cd frontend && npm run dev`) and sign in as an **admin**.
3. Open **Content Plan** (`/admin/content-plan`). Expected: Semua tab, ten rows a page, farthest deadline first; every filter choice appears in the address bar; reloading the address restores the same view.
4. Click **Perlu Approval**. Expected: only `pending`+`draft_review` rows; the counter is red when > 0; choosing a period shows "Periode tidak berlaku di tab ini" and is not sent; the search box keeps its text; the status choices are the two statuses only.
5. Click **Menunggu Kreator** then **Selesai**. Expected: waiting shows its grey counter even at zero; Selesai has no status or overdue filter; each empty tab has its own wording ("Tidak ada yang perlu di-approve." etc.).
6. Pick a creator, a type and a status; change the period to *Kustom* and set from/to. Expected: each choice is one URL write, the page resets to 1, and the list narrows accordingly; **Reset** returns to the bare tab but keeps the tab.
7. Click the **Deadline** header. Expected: the direction flips (`desc` ↔ `asc`) and is announced to screen readers; flipping back to the default removes the parameter.
8. Click a row (or open `/admin/content-plan?content=<id>` directly). Expected: the Content Detail panel opens for that content; deciding from it reloads the list; closing it removes `?content=` from the address.
9. **Negative / edge:** `/admin/content-plan?tab=draft&sort=sideways&page=abc` → all fall back to the defaults (Semua, desc, page 1). Stop the backend, press a tab → the error message's retry re-requests the exact same URL. Filter past the last page → the list refetches instead of showing a wrong empty state.
10. Visit `/admin/submissions`. Expected: permanent redirect to `/admin/content-plan?tab=action`; the nav reads "Content Plan".

## Related Issues

- SCRUM-144 (Content Plan page — PBI 5)
- Consumes the 5.1 placeholder endpoint contract; reuses SCRUM-155's Content Detail panel and `?content=` deep link and SCRUM-146's six-status vocabulary; retires the SCRUM-123/129 submission queue surface.

## Author Checklist

- [x] Code follows team coding standards and style guide
- [x] Self-reviewed the code changes
- [x] Added/updated tests for new functionality
- [x] All tests and lint pass locally
- [x] Code is properly documented
- [ ] Config/env changes are documented (no config/env changes)
- [ ] Synced with the latest base branch of this PR (base branch to confirm with the team)
- [x] PR title follows conventional commit format
- [x] Meaningful commit messages used

## Additional Notes

- **TDD:** 23 commits in 11 RED→GREEN pairs + one `[REFACTOR]` gate cleanup (`cf2a6bf`), run in strict order per pair; tests were executed once at the end (per instruction) and all four gates passed on the first full run after the cleanup.
- **Design:** Single Source of Truth (`CONTENT_PLAN_TABS` drives labels, statuses, counters, urgency — OCP); pure/server split (`lib/content-plan.ts` is `next/headers`-free so client components share it; `content-plan.server.ts` owns the cookie fetch behind a port — SRP/DIP); Adapter (`parse/build/href` own all URL semantics); tab-scoped predicates (`tabDef`, `statusInTab`) instead of per-tab JSX; `useUrlFilters()` and `MultiSelect` reused from the existing kit (DRY).
- **DoD-3 (perf):** this subtask consumes 5.1's endpoint as agreed; endpoint perf is 5.1's DoD, measured on staging after merge, not assumed.
- **DoD-4 / DoD-5:** team-level gates — flagged honestly, not claimed by this PR.
- **Known follow-ups (not in this PR):** when 5.1's real endpoint lands, swap the placeholder fetch (the loader port keeps the swap a one-file edit); dashboard/notification surfaces can deep-link into `?content=` the same way Task Saya does.
- Local gates: frontend 1 094/81, 100 % coverage across statements/branches/functions/lines, `tsc` exit 0, `eslint` clean, `npm run build` succeeds. Backend untouched.

## Type of task

- [ ] Backend / API
- [x] Frontend / UI
- [ ] Database / Migration
- [x] Testing
- [ ] Bug fix
- [ ] Refactor
- [ ] Performance
- [ ] Security
- [ ] CI/CD
- [ ] Documentation

## Reviewer(s)

- [ ] @Bastian2312
- [ ] @EvelynOct
