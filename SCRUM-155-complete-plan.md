# SCRUM-155 — Role-Based Actions Panel: Complete Plan

Branch: `role-based-actions-panel_155` (exists, clean, 0 commits).
Companion docs: `PBI-6-subtask-placeholders.md` (siblings' scope + shared contracts), `SCRUM-155-design-patterns-solid.md` (rubric mapping).

---

## 0. Mission and boundary

**Your deliverable:** the *current-step action card* — the part of the Content Detail panel that shows "Menunggu Aksi / Menunggu Admin / Menunggu kreator" with the role-correct buttons, where **Kirim is disabled while the revision note is empty** — plus a panel host that opens **from every touchpoint with the same content**.

**Not yours (siblings, per PBI-6 placeholders):**

| Subtask | Owns | You consume |
|---|---|---|
| 6.1 status model | 6 statuses; `draft_revised` removed + migration | the enum your adapter types use |
| 6.2 tags | Overdue / Late Submission / Bypass computed **and persisted** | `tags` on the detail response |
| 6.3 event history | append-only events + timeline endpoint (latest on top) | the whole payload your panel renders |
| 6.4 review actions | approve/revise endpoints hardened on the new statuses | `PATCH .../approve`, `.../revise` (already exist) |
| 6.5 detail panel | header, vertical timeline, draft history | the `actions` slot you mount into |

**Hard rule of this plan:** you build **against contracts, not against siblings' merge dates.** Fixtures first, real endpoint second. This is the payoff of the Dependency Inversion design — it is also the only way six subtasks ship in one sprint.

---

## 1. Current state (measured, 9 Oct)

| Requirement | Reality |
|---|---|
| Panel exists | Only `DraftPreviewModal`, **submission-keyed** (`draft-preview-modal.tsx:157`), admin-only endpoint `GET /submissions/:id` + `AdminGuard` (`submissions.controller.ts:37,78`) |
| Role-based actions | Admin: `review-actions.tsx:148-158`. Creator: separate, in Task Saya rows (`my-task-board.tsx:96`, facts from `task-actions.ts:42-55`). Never in one view |
| "Kirim disabled when empty" | **Already shipped** at `review-actions.tsx:56,130` — your job is to promote it into a command contract, not re-solve it |
| Touchpoints | Content Plan: no (only `AddContentModal`). Creator Detail: no (`creator-detail-modal.tsx:205-218` pills only). Task Saya: no (`my-task-board.tsx:51-99` opens submit modals only). **Dashboard: page does not exist** (`app/page.tsx:9` redirects). **Notifications: zero code** |
| `draft_revised` blast radius | 43 files (17 frontend, 26 backend) — 6.1's problem, but your status unions live in `lib/creators.ts`, `lib/my-tasks.ts`, `lib/submissions.ts`, `content-labels.ts` |

---

## 2. Contracts to lock before any code (one conversation, then write them down)

| # | Contract | Form | With |
|---|---|---|---|
| **C1** | Detail endpoint response: `{ id, name, type, brief, deadline, status, creator: {name}, tags: {overdue, lateSubmission, approvalBypassed}, waitingOn, latestSubmissionId?, creatorActions: TaskAction[], events: Event[] }` | one JSON fixture committed in your branch as `frontend/src/lib/__fixtures__/content-detail.json` | 6.3 owner |
| **C2** | Timeline order: endpoint guarantees newest-first; client never re-sorts | stated in both PRs | 6.3 owner |
| **C3** | Action endpoints unchanged: `PATCH /submissions/:id/approve`, `PATCH /submissions/:id/revise` (note ≤ 1000, `revise-submission.ts:8`) | no change requested | 6.4 owner |
| **C4** | Panel slot: 6.5's panel accepts `actions?: ReactNode` rendered in the current-step card (the `DraftPreviewModal` precedent, `draft-preview-modal.tsx:160,199`) | prop signature agreed in writing | 6.5 owner |
| **C5** | Entry points open the panel by **contentId** and reflect it as `?content=<id>` so a future notification link deep-links | you own the param | you |

If C4's owner has not started, **you build the shell** (header + slot + load states) and they add timeline + draft history into it. Say which in standup; the panel must have exactly one owner.

---

## 3. Workstreams and TDD steps

Each step = one `[RED]` commit + one `[GREEN]` commit (± `[REFACTOR]`), house convention.

### WS1 — Ports, fixtures, adapter (no UI, no network)

**S1 `[RED]` `lib/content-detail.ts` — types + adapter**
`RawContentDetail → ContentDetail` via `toContentDetail(raw, id)`, mirroring `toDraftPreview` (`draft-preview.ts:64-81`).
Tests: null header fields → `EMPTY`; empty/whitespace event note dropped; **array order unchanged** (C2); `ContentDetailError` keeps `status` so 404 ≠ 500 (`draft-preview.ts:52-57`).
*Patterns proven: Adapter, State.*

**S2 `[GREEN]`**

**S3 `[RED]` `fetchContentDetail(id, role)` — the loader port**
`apiFetch` + `encodeURIComponent(id)` (OWASP A01, `draft-preview.ts:89`); URL by role: admin `/api/contents/:id`, creator `/api/me/contents/:id`. Export `type ContentDetailLoader = (id, role) => Promise<ContentDetail>` so the panel never imports `api-client`.
Tests: both branches with `vi.mocked`; 404 → `ContentDetailError(404)`.
*DIP + ISP.*

**S4 `[GREEN]`**

### WS2 — Action commands and role strategy (pure, the rubric core)

**S5 `[RED]` `lib/panel-actions.ts` — `PanelCommand` + `actionsFor`**
```ts
interface PanelCommand { kind; label; variant; canRun(): boolean; run(): Promise<void> }
function actionsFor({ role, waitingOn, latestSubmissionId, creatorActions, ports }): PanelCommand[]
```
Table tests (one table, many rows):
- admin + `waitingOn:'admin'` → `[approve, revise]`; revise `canRun()` false on `""` and `"   "`, true on `"x"`.
- admin + `waitingOn:'creator'` → `[]` (waiting message, no buttons).
- creator + `creatorActions:['submit_draft']` → one command; `['submit_video']` → H-1 label variant.
- `link_submitted` → `[]` for both roles.
- **OCP test:** inject a command of a kind the codebase has never seen → it renders and `run()` is called; no component edit allowed.
- **LSP test:** two different `run` implementations driven through the same footer without the panel knowing which.
*Patterns: Command, Strategy, Null Object, OCP/LSP from the design doc §2.1–2.5, §3.*

**S6 `[GREEN]`** — commands call the existing ports: `approveSubmission` / `reviseSubmission` (`draft-review-actions.ts:56-73`) for admin; `submitVideo` / draft submitter contracts for creator (reuse, don't fork — `video-submission.ts:35-38`).
**Discipline line to state in the PR:** buttons are UX only; authority stays in the endpoints' compare-and-set (`submission-review.service.ts:110-119`).

### WS3 — The panel host + current-step card

**S7 `[RED]` `components/content-detail/content-detail-panel.tsx` — shell**
`LoadState` union (`loading | loaded | not_found | failed`, copy `draft-preview-modal.tsx:26-30`), `load: ContentDetailLoader = fetchContentDetail` prop, header fields, status pill + **separate** Overdue / Bypass pills (rendered *beside* status, never as it), `actions` slot per C4.
Tests: three load states; tags beside status; slot renders only when loaded.
*Patterns: State, Composite slot, DIP via prop.*

**S8 `[GREEN]`**

**S9 `[RED]` current-step card** — `WaitingStep` ("Menunggu Aksi / Menunggu Admin / Menunggu kreator") + command projection: `commands.map(c => <Button disabled={!c.canRun()} …>)`. Revision form inside the card: focus on open, return focus on Batal (reuse the `cancelled` flag, `review-actions.tsx:52-53,92`), error inline, note preserved on failure.
Tests: the literal subtask AC — **Kirim disabled on mount, still disabled on whitespace-only, enabled after text, sends trimmed note, 422/409 keeps the modal open with the note**.
*This is your acceptance criterion as a test name — keep it quotable.*

**S10 `[GREEN]` + `[REFACTOR]`** — extract the decision form out of `review-actions.tsx` into the shared piece; do not copy-paste it.

### WS4 — Surface migration (one panel, not two)

**S11 `[RED]`** queue's "Lihat Detail" (`submission-queue-table.tsx:93-106`) opens the new panel keyed by **contentId**.
**S12 `[GREEN]` + `[REFACTOR]`** — delete `draft-preview-modal.tsx`; rewrite `draft-review.integration.test.tsx` against the panel.
⚠ Coordinate with 6.5: if their timeline panel is the final home, this step merges your card into *their* shell instead of yours (C4). Decide at S7, not at S11.

### WS5 — Touchpoints (three of five, deep-link for the other two)

**S13–14** Content Plan: row click → panel; test passes the row's contentId.
**S15–16** Creator Detail: history row → panel (`creator-detail-modal.tsx:205-218`); "Rincian" button per prototype when the row has no action.
**S17–18** Task Saya: extend the existing `Opened` state (`my-task-board.tsx:11,35`) — **do not add a second state owner**; panel mounts with role `creator`.
**S19–20** Deep link: `?content=<id>` opens on mount (C5). This is the future notification hook; document it as the reason dashboard/notifications are out of scope.
*OCP for entry points: adding a fifth touchpoint = one prop + one handler, no panel edit.*

### WS6 — DoD evidence

| DoD | Action |
|---|---|
| ≥80 % backend | your backend touch is ~zero (endpoints exist); frontend new files at 100 % per team bar |
| 100 % AC in frontend tests | the S5/S9 test tables **are** the AC list — name them accordingly in the PR |
| <300 ms reads | you add no read endpoint; if the panel feels slow, it is 6.3's query — measure, then report |
| 10 concurrent / p95 | no harness in repo (`scripts/` has only `coverage-badge.mjs`). Either it is someone's ticket or you add `scripts/load-detail.js` (autocannon, 10 conn, 30 s) against staging |
| Staging | existing Cloud Run workflows; smoke the three touchpoints on the staging URL |

---

## 4. Sequence and parallelism

```
Day 1  C1–C5 contracts (one meeting) · WS1 (S1–S4) — unblocked by fixtures alone
Day 1–2  WS2 (S5–S6) — pure functions, highest rubric value, zero dependency on siblings
Day 2–3  WS3 (S7–S10) against the fixture loader
Day 3   swap fixture → real endpoint when 6.3 lands (one prop default changes)
Day 3–4  WS4 + WS5 (S11–S20)
Day 4   WS6 evidence, PR write-up, SonarCloud gate
```

Your critical path does **not** wait for 6.1/6.2/6.3: WS1–WS3 are fully testable against the committed fixture. The only day-of swap is the loader's default.

---

## 5. Risks (ranked) and the pre-agreed response

1. **6.3 slips** → your panel ships on the fixture in demo, real data behind the same port the day it lands. No rework, because the adapter isolates the shape.
2. **6.1 removes `draft_revised` and 6.4 re-cuts the guards** → your card must not assume which statuses are reviewable; it renders `waitingOn` **facts from the endpoint**, never a client-side status switch. Add a test: status union changes → `actionsFor` table still passes because it keys off `waitingOn`, not the enum.
3. **Nobody owns the panel shell** → you own it (S7), 6.5 fills the slot. Announce it, or you get two panels.
4. **Dashboard/notification pressure in review** → the PR's scope-boundary section states: entry points exist as `?content=` deep links; the surfaces themselves are other PBIs. Cite `app/page.tsx:9` (no dashboard exists) and the absence of any notification module.
5. **Load-test DoD with no harness** → escalate in standup week 1; DoD-4 cannot be claimed by silence.

---

## 6. PR discipline (match the team's bar)

- Commits: `[RED] …` / `[GREEN] …` / `[REFACTOR] …`, one behaviour per sentence, TDD pairs visible in history.
- New files at 100 % coverage; `npm run lint && npm run test:cov` clean; SonarCloud gate green.
- PR body: Summary (per contract C1–C5), **How to Test** step-by-step, Related Issues (SCRUM-155, PBI-6), scope boundary (dashboard/notifications/deep-link), checklist, deviation notes.
- Design section: one paragraph per pattern with problem → file → proving test → cost (from `SCRUM-155-design-patterns-solid.md` §5).

---

## 7. Definition of Done, mapped

| Your subtask AC | Proving test (step) |
|---|---|
| In-progress step shows Approve / Minta Revisi for the right role | S5 table (admin rows) |
| Kirim disabled while note empty | S9: mount → disabled; spaces → disabled; text → enabled |
| Panel opens from Content Plan / Creator Detail / Task Saya with the same content | S13–S18 |
| (Dashboard, notification links) | S19–S20 deep link + explicit scope boundary |
| Rubric: patterns & SOLID | S5 OCP/LSP tests + design doc self-check |

**Definition of "done done":** merged to staging, three touchpoints smoke-tested there, PR shows the pattern→test mapping, and the two out-of-scope entry points are written down as blocked — not silently skipped.
