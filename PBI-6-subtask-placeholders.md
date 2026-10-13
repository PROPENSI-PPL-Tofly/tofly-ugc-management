# PBI 6 — Content Lifecycle & Detail Panel: Subtask Placeholders

Working document. One placeholder per subtask so each owner can start from scope + contracts + open questions instead of a blank file. Replace `[OWNER]` and the branch name, then expand your own card into a full TDD plan.

**Shared artefacts:** prototype lifecycle drawer (`Tofly Module 1 Prototype (Copy).html`, `openLifecycle` ~line 4355), `backend/prisma/schema.prisma`, `frontend/src/lib/content-labels.ts`.

---

## 0. Dependencies and the three contracts to agree before anyone codes

```
6.1 status model + migration
 ├─> 6.2 tags            (tags are computed FROM statuses + dates)
 ├─> 6.3 event history   (events are written AT each status transition)
 └─> 6.4 review actions  (actions must reject on the new statuses)
        └─> 6.5 Content Detail panel  <── role-based actions panel (mine)
                 both consume 6.3's endpoint
```

**Contract A — status enum (owned by 6.1).** Six values only: `pending`, `scheduled`, `draft_review`, `draft_revision`, `draft_approved`, `link_submitted`. `draft_revised` is removed. Frontend labels and tones follow in `content-labels.ts` ("Draft Revised" disappears from every view).

**Contract B — event row (owned by 6.3).** Every event: `content_id`, `type`, `actor_user_id` (+ resolved name and role in the response), `occurred_at`, `payload` (version + link / note / link). Types: `scheduled`, `draft_submitted`, `revision_requested`, `draft_approved`, `link_submitted`, `creator_comment` (max 500 chars, proposed).

**Contract C — tag facts (owned by 6.2).** `overdue`, `late_submission`, `approval_bypassed` returned as orthogonal booleans beside the status, never as a status value. Consumed by 6.5 and the actions panel.

> Rule for all six subtasks: **a tag or a timeline event that is computed at read time and not persisted at write time will be wrong the moment the status moves on.** See each card's "Persist or compute" note.

---

## 6.1 Build the lifecycle status model and data migration

**[OWNER]** · branch `[feat/status-model_XXX]` · blocks: everything

### Goal
Six statuses only; `draft_revised` gone; no row left in an old status after migration.

### Blast radius (measured, not estimated)
`draft_revised` is referenced in **43 files**: 17 frontend, 26 backend (including 6 e2e specs and the seed). The load-bearing ones:

| File | Why it breaks |
|---|---|
| `backend/src/submissions/review-queue.ts:89-92` | **`STATUS_RANK` puts `draft_revised` first** — this is the PRD 3.11 "resubmits first" ordering. Removing the status silently deletes that requirement. |
| `backend/src/contents/draft-submission.ts:97,106` | Resubmit currently **writes** `draft_revised`. After 6.1 it must write `draft_review`. |
| `backend/src/submissions/draft-review.ts` | `REVIEWABLE_STATUSES` — the compare-and-set guard on approve/revise. |
| `backend/src/me/task-status-filter.ts` | Task Saya status filter offers `draft_revised` as a choice. |
| `frontend/src/lib/content-labels.ts:8-15,27-34` | Labels + tones; also rename to the PBI's English lifecycle wording (decision needed). |
| `frontend/src/lib/submissions.ts:11`, `my-tasks.ts`, `creators.ts` | Frontend status unions. |
| `supabase` seed + `backend/test/*.e2e-spec.ts` | Seed rows and 6 e2e suites assert the old enum. |

### Blocking decision (raise in standup first)
**How does "resubmits first" survive without `draft_revised`?** Options: (a) derive rank from "this content already has ≥1 submission" (a join, already available), (b) take it from 6.3's event history (a `revision_requested` event exists), (c) drop the requirement. Decide *before* the migration, because (a) and (b) change the queue query.

### TDD skeleton
- RED: migration test — seed a `draft_revised` row, run migration, assert it lands in `draft_review` and **zero** rows remain in the dropped enum value.
- RED: `draft-submission` resubmit path now writes `draft_review`.
- RED: `compareQueueEntries` resubmit-first rank without the enum.
- RED: review-queue filter and Task Saya filter reject/absorb the removed value.
- RED: approve/revise still only fire on the reviewable set (regression on the compare-and-set guard).

### Persist or compute
Migration only — but the enum ALTER must be ordered after the data UPDATE, and Postgres will reject the UPDATE if app code still writes the old value. Deploy order: app first (stops writing `draft_revised`), then migration. Say this out loud in the PR.

---

## 6.2 Apply Late Submission, Overdue, and bypass tags

**[OWNER]** · branch `[feat/lifecycle-tags_XXX]` · depends on: 6.1

### Goal
Three orthogonal tags, never statuses: **Overdue** (deadline passed, not yet `link_submitted`), **Late Submission** (link sent after the deadline), **Approval di-bypass** (link submitted while the draft was never approved).

### Key evidence
- Prototype rules: `isOverdueTag()` excludes `link_submitted`; `isLinkSubmittedWithoutApproval()` checks the draft's stored status; late is stamped at submit time (`wasLateSubmission`, `daysLateAtSubmission`).
- Bypass path in the real backend: `task-actions.ts:30-39` (`canSubmitVideo` = `draft_approved` **or** H-1 grace window) + `video-submission.service.ts:139-153`.

### Persist or compute — the whole subtask in one line
- `overdue` → **compute** at read time (pure date comparison, matches prototype).
- `late_submission` → **must persist at write time** in `video-submission.service.ts` (inside its existing compare-and-set transaction): `submitted_late boolean` + optionally `days_late int`. Once `link_submitted`, "was it late" is unrecoverable.
- `approval_bypassed` → **must persist at write time**, same place: true when the status guard let the link through from anything other than `draft_approved`.

### TDD skeleton
- RED: `video-submission` sets `submitted_late`/`approval_bypassed` correctly for the three paths (approved → link; draft_review inside H-1 → link; after deadline → link).
- RED: compare-and-set still rejects double submission (do not weaken the status guard while adding columns).
- RED: read-side tag assembly — overdue false on `link_submitted`, true on `draft_approved` past deadline; bypass tag only beside `link_submitted`.
- Migration: three additive columns (nullable/default), **forward-only for existing rows** — decide the backfill or state that old rows show no tags.

### Open questions
- Does Late Submission reuse the "Overdue" pill text (prototype does) or get its own label? Two different meanings behind one word will confuse UAT.
- Penalties/bonus for late evergreen are invoicing-side — out of scope here? Confirm.

---

## 6.3 Build the content event history and timeline endpoint

**[OWNER]** · branch `[feat/content-events_XXX]` · depends on: 6.1 · unblocks: 6.5, my panel

### Goal
Append-only event log per content + `GET` endpoint returning all events of one content, **latest on top**, each with type, actor (name + role), timestamp, payload.

### Key evidence — the four write paths that must emit events
| Event | Written where today |
|---|---|
| `scheduled` | `content-creation` (`contents.service.ts:157`) and creator onboarding (`creator-onboarding.service.ts:132`) |
| `draft_submitted` (+version, link) | `draft-submission.service.ts` (version = count of prior submissions for that content) |
| `revision_requested` (note) | `submission-revision.repository.ts:125-156` (inside `$transaction`) |
| `draft_approved` | `submission-review.service.ts:110-116` (compare-and-set) |
| `link_submitted` (link) | `video-submission.service.ts:147-166` (compare-and-set) |
| `creator_comment` (≤500, proposed) | **does not exist** — needs an endpoint + validation (mirror `revise-submission.ts` for the 422 shape) |

### Contracts to publish early (everyone is blocked on these)
1. Response shape of the timeline endpoint (event envelope: `type`, `actor: {name, role}`, `at`, `payload`).
2. Where the endpoint lives: `GET /contents/:id/events` (AdminGuard) + `GET /me/contents/:id/events` (DevCreatorGuard, own content only) — mirrors the existing `/contents` vs `/me` split.
3. Whether the timeline endpoint is 6.3's or folded into 6.5's content-detail read. **Recommend one endpoint returning content + events together** — one query, one auth path, and it is what both panels need (DoD-3: < 300 ms reads).

### TDD skeleton
- RED: each of the five existing write paths emits exactly one event with the right actor inside the same transaction (a failed transition must not leave a stray event — assert `count === 0` writes nothing).
- RED: `creator_comment` endpoint — 422 on blank/over-500, 404 on another creator's content, actor recorded from the session, never from the body.
- RED: endpoint returns newest-first, is stable for equal timestamps, 400 on malformed id, 404 on unknown content.
- RED: creator cannot read another creator's events (404, not 403).
- e2e: full lifecycle → assert the exact event sequence for (a) clean approve path, (b) revision loop, (c) H-1 bypass.

### Persist or compute
Everything is persisted. This subtask *is* the persistence. Add the index on `(content_id, occurred_at desc)` in the same migration.

### Also unblocks, for free
6.1's "resubmits first" question (option b), and the panel's "Draft di-approve" timeline entry that the current schema cannot produce.

---

## 6.4 Build the review actions

**[OWNER]** · branch `[feat/review-actions_XXX]` · depends on: 6.1, 6.3

### Goal
Approve → `draft_approved`; Request Revision (note, max 1 000 chars) → `draft_revision`; an action is rejected when the current status does not allow it.

### Honest status report — most of this already exists
| Requirement | State |
|---|---|
| Approve endpoint | Done: `PATCH /submissions/:id/approve` (`submissions.controller.ts:90-95`) |
| Revise endpoint + 1 000-char note | Done: `revise-submission.ts:8,38-42` (`MAX_REVISION_NOTES_LENGTH = 1000`), `submission-revision.controller.ts` |
| Reject when status disallows | Done, via compare-and-set guards (`submission-review.service.ts:110-119`, `submission-revision.repository.ts:126-140`) returning 409 |
| Emits 6.3 events | **Missing** — must be added at both write points |
| Status names after 6.1 | **Breaks** — `REVIEWABLE_STATUSES` and any `draft_revised` branch must be re-cut |

### TDD skeleton
- RED (mostly regression): approve only from the reviewable set; revise only from the reviewable set; 409 on a superseded submission; 404 on unknown id; 400 on non-UUID.
- RED (new): each action writes its 6.3 event in the same transaction, and a rejected action writes nothing.
- RED (new, 6.1): after the enum change, `draft_review` is the only reviewable status — assert the guard table explicitly.
- e2e: two racing approvals → exactly one succeeds, one event written (the existing race test in `backend/test/` is the template).

### Persist or compute
Nothing new; do not add columns here. If you find yourself needing one, it belongs in 6.2.

---

## 6.5 Build the Content Detail panel with timeline and draft history

**[OWNER]** · branch `[feat/content-detail-panel_XXX]` · depends on: 6.2, 6.3 · integrates with: my role-based actions panel

### Goal
Header with type, status, deadline **D-n**, brief. Vertical timeline, latest event on top. Draft history, latest version on top, with a version label.

### Key evidence — what to reuse, what not to duplicate
- `DraftPreviewModal` (`frontend/src/components/draft-review/draft-preview-modal.tsx`) is submission-keyed and admin-only; the prototype says this panel **replaces** it. Plan the deletion, don't run two panels.
- Revision history today is **oldest-first** (`draft-preview.ts:47-48` sorts ascending; `RevisionHistory` labels "Revisi ke-N"). The PBI wants newest-first **with version labels** — that is a behaviour change, not a copy.
- `DetailField`, `StatusDot`, `Pill`, `Modal` exist in `components/ui/`.
- D-n wording: the prototype's `lcDue()` produces `H-n` / `Hari ini` / `Lewat n hari` / `Selesai`.

### TDD skeleton
- RED: adapter (`lib/content-detail.ts`) maps the 6.3 response to the view model; timeline stays newest-first; missing header fields fall back to `EMPTY`.
- RED: header renders type, status pill, D-n, brief (brief hidden for evergreen, matching `draft-preview-modal.tsx:115`).
- RED: draft history lists versions newest-first, each labelled (e.g. "Draft v2"), link rendered through `safeHref`.
- RED: tags from 6.2 render **beside** the status, never as the status.
- RED: 404 / failed / loading states (copy the `LoadState` one-state-at-a-time pattern).

### Persist or compute
Frontend only. The one rule: **the client never re-sorts the timeline** — the endpoint's order is the contract, exactly like `submissions` `orderBy` today.

### Coordination note
My subtask (role-based actions panel) mounts inside this panel's current-step card. Agree the slot/props contract here first — the prototype passes `actions` into a footer/now-card, which is already how `DraftPreviewModal` works (`actions?: ReactNode`, `draft-preview-modal.tsx:160`). Prefer extending that pattern over inventing a second one.

---

## 1. Blocking-decision log (update as decisions land)

| # | Decision | Owner | Needed by | Status |
|---|---|---|---|---|
| B1 | How "resubmits first" survives without `draft_revised` | 6.1 | before migration | open |
| B2 | One combined content+events endpoint vs two | 6.3 | before 6.5 starts | open |
| B3 | Backfill (or not) for 6.2's write-time tags on existing rows | 6.2 | before migration | open |
| B4 | "Pending" (`pending_proposal`) — in this PBI or later? `is_proposal`/`proposal_notes` exist but are used by nothing | PBI | before 6.1 freezes the enum | open |
| B5 | Late Submission pill: own label or reuse "Overdue" | 6.2 | before 6.5 renders tags | open |
| B6 | Deploy order: app that stops writing `draft_revised` ships **before** the enum migration | 6.1 | at release | open |

---

## 2. Cross-subtask test obligations (keep the DoD honest)

- **DoD-1 (backend ≥ 80 %)**: 6.1–6.4 are backend-heavy; every new file at 100 % per team convention.
- **DoD-3/4 (< 300 ms reads, 10 concurrent, p95)**: only the 6.3/6.5 read is a user-facing hot path — one nested query, index on `(content_id, occurred_at desc)`. There is **no load-test harness in the repo** (`scripts/` holds only `coverage-badge.mjs`); someone must own adding one before DoD-4 can be claimed.
- **DoD-5 (staging)**: every subtask merges to the same staging pipeline; 6.1's deploy-order decision (B6) is a release risk for the whole PBI, not just its owner.
