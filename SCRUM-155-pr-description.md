**Title:** `feat(content-detail): open the role-based Content Detail panel from every touchpoint`

## Summary

Implements **SCRUM-155 of PBI 6** (Content Lifecycle & Detail Panel): the current-step action card of the Content Detail panel, and the panel itself opened from every existing touchpoint with the same content.

- **Backend — one content-keyed detail read.** `GET /contents/:id` (AdminGuard) and `GET /me/contents/:id` (DevCreatorGuard, scoped to the contract the session resolved) answer the same payload in **one nested query**: content header fields, the creator name, the journey (newest event on top), `waitingOn`, `latestSubmissionId`, and the creator's allowed actions (reused from `task-actions.ts`, never re-derived). A creator asking for somebody else's content gets **404, not 403**, so the endpoint never confirms that an id exists (OWASP A01).
  - `backend/src/contents/content-detail.ts` — pure facts: `waitingOnFor`, `isOverdue`, `buildEvents` (scheduled → Draft vN → revisi → approve → link), `toContentDetail`.
  - `backend/src/contents/content-detail.service.ts` — `Pick<PrismaService, 'contents'>` contract, one `findFirst` with a nested `select`; 404 on a miss.
  - Queue rows now carry `contentId` (`review-queue.dto.ts`, `review-queue.service.ts`) so one item reaches both the decision and the journey.

- **Frontend — one panel, role-driven commands.**
  - `frontend/src/lib/panel-actions.ts` — `actionsFor({role, detail, state, ports})` picks the command list (Strategy); each command is a `PanelCommand` with its own `canRun()` (Command). The admin branch offers **Minta Revisi** (opens the note form) and **Approve** against the latest submission id; the creator branch maps the server's `creatorActions` to buttons whose `run()` hands the action back to the touchpoint. `submitRevision` is the subtask's acceptance criterion as a command: **Kirim stays disabled while the note is empty or whitespace-only**, and a decision already in flight locks it however good the note is.
  - `frontend/src/lib/content-detail.ts` — adapter + `ContentDetailLoader` port; role-aware URL (`/api/contents/:id` vs `/api/me/contents/:id`), id `encodeURIComponent`-ed (OWASP A01), `dueLabel` for the D-n countdown.
  - `frontend/src/components/content-detail/content-detail-panel.tsx` — loads by contentId, renders header (creator, type, status **with separate Overdue / Late Submission / Approval-bypassed pills beside it**, deadline + D-n, brief), the vertical journey newest-first, and the current-step card with the role-based actions and the revision form (focus follows the admin into the textarea, returns to the button on Batal, a failed decision keeps the panel open with the backend's reason and the typed note). An `actions` ReactNode slot replaces the command list entirely when a touchpoint brings its own.
  - **Touchpoints:** the review queue's *Lihat Detail* (`submission-queue-table.tsx`), Content Plan rows (`content-plan-client.tsx`), Creator Detail history rows (`creator-detail-modal.tsx`), Task Saya rows (`my-task-board.tsx` / `my-task-table.tsx`, creator role; its submit commands open the existing Submit Draft / Submit Link Video modals), and a `?content=<id>` deep link on `/creator/tasks` — the creator dashboard and the hook a future notification link reuses.

- **Scope boundary (agreed):** the old submission-keyed Draft Preview is retired — `draft-preview-modal.tsx`, `review-actions.tsx`, `draft-preview.ts` and their tests are deleted (−1 314 lines); the queue now mounts the panel. The dashboard and notification surfaces themselves do not exist yet in the app; they are delivered as the `?content=` deep link.

- **Contract with sibling subtasks:** the payload shape (C1), newest-first order (C2) and unchanged action endpoints (C3) were locked before coding, and the work was built against a committed fixture — it does not wait on 6.1/6.2/6.3. Two tags (`lateSubmission`, `approvalBypassed`) are hard `false` until 6.2 writes them at submit time, and the journey's approval event is only emitted while it is provable; both are documented in `content-detail.ts` and will be replaced by 6.3's event history behind the same response shape.

## How to Test

1. `cd backend && npm run lint && npm run test:cov` — lint clean, **882 tests** passing, every new file at 100 % lines, the 100 % `src/me/**` threshold holds.
2. `cd frontend && npm run lint && npm run test` — eslint clean, **864 tests** passing.
3. Start backend + frontend (`docker compose up -d db`, migrations/seed per README, `npm run start:dev`, `cd frontend && npm run dev`) and sign in as an **admin**.
4. Open **Antrian Draft** (`/admin/submissions`) → *Lihat Detail* on a draft in *Draft Menunggu Review*. Expected: the panel opens **by content**, header shows creator/type/status/deadline D-n/brief, the current step says *Menunggu Admin* with **Minta Revisi** and **Approve**, and the journey lists the scheduled event and the draft versions newest-first.
5. Click **Minta Revisi**. Expected: the note form opens with focus in the textarea, *Tutup* disappears (Batal is the way out), and **Kirim Revisi** is disabled on an empty note and on whitespace-only text, enabling only after real characters.
6. Submit a note, then re-open and click **Approve** on another draft. Expected: on success the panel closes and the queue refreshes (the decided row drops out); with the backend stopped, the panel stays open showing the fallback message and the typed note is preserved.
7. Open **Content Plan** (`/admin/creators/<id>/content-plan`) and **Creator Detail** → *Riwayat konten* → *Detail* on any row. Expected: the same panel opens for that content as the admin.
8. Sign in as a **creator** → **Task Saya** → *Detail* on a row. Expected: the panel opens with the creator's own commands (e.g. *Submit Link (H-1)* inside the grace window, *Submit Link Video* after approval); pressing one closes the panel and opens the existing submit modal for that row.
9. Visit `/creator/tasks?content=<id>` directly (or from a bookmark). Expected: the panel for that content opens without any click — this is the notification deep-link path.
10. **Negative:** as a creator, `GET /api/contents/<someone-elses-content>` → 404 (not 403). `GET /api/contents/not-a-uuid` → 400. `GET /api/me/contents/<a-foreign-content>` → 404.

## Related Issues

- SCRUM-155 (role-based actions panel — PBI 6, Content Lifecycle & Detail Panel)
- Consumes contracts from 6.1 (status enum), 6.2 (tag write-time columns), 6.3 (event history endpoint); replaces the Draft Preview surface delivered in SCRUM-123/129.

## Author Checklist

- [x] Code follows team coding standards and style guide
- [x] Self-reviewed the code changes
- [x] Added/updated tests for new functionality
- [x] All tests and lint pass locally
- [x] Code is properly documented
- [ ] Config/env changes are documented (no config/env changes)
- [x] Synced with the latest base branch of this PR
- [x] PR title follows conventional commit format
- [x] Meaningful commit messages used

## Additional Notes

- **TDD:** 18 commits in 9 RED→GREEN pairs (`8d333b7`→`e038674` pure journey facts, `8238de3`→`6668355` both endpoints, `58ebf21`→`dedba55` queue contentId, `4d7a3f9`→`f5a9a58` loader/adapter, `0445f42`→`72c3797` role commands + Kirim gate, `981e472`→`33040be` panel, `899d5ea`→`42cd231` queue migration, `74f15cb`→`22487be` touchpoints), plus `0188b2d` (gate cleanup) and `4ab51a1` (restored `/me` spec + new endpoint tests after `test:cov` caught a clobbered file — worth a glance, it restores main's supertest suite and adds the `ContentDetailService` provider).
- **Design:** Command (`PanelCommand.canRun/run`), Strategy (`actionsFor`), Dependency Inversion (`ContentDetailLoader` + `PanelActionPorts` injected as props), Open/Closed (the `actions` slot; the OCP test renders an injected command kind with no component edit), Adapter (`toContentDetail`). The buttons are **UX only** — every action's authority stays in the endpoints' compare-and-set guards.
- **DoD-3:** the detail read is a single `findFirst` with one nested `select` (PK lookup + `submissions_content_created_at_idx`); measured on staging after merge, not assumed.
- **Known follow-ups (not in this PR):** 6.2's write-time columns flip `lateSubmission`/`approvalBypassed` from their provisional `false`; 6.3's event table replaces the derivation in `buildEvents` behind the same contract; 6.5 enriches the journey rendering (version labels, draft history).
- Local gates: backend 882/57, frontend 864/71, both `tsc` exit 0, both linters clean.

## Type of task

- [x] Backend / API
- [x] Frontend / UI
- [ ] Database / Migration
- [x] Testing
- [ ] Bug fix
- [x] Refactor
- [ ] Performance
- [x] Security
- [ ] CI/CD
- [ ] Documentation

## Reviewer(s)

- [ ] @Bastian2312
- [ ] @EvelynOct
