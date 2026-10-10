**Mini Sprint Report — SCRUM-155: Role-Based Actions Panel (PBI 6)**

**Branch:** `role-based-actions-panel_155` · **Period:** 2026-10-09 · **PR:** pending

---

**Subtask Completed**

**[Role-Based Actions Panel — SCRUM-155]** Built the Content Detail panel's current-step action card and opened it from every existing touchpoint. The panel loads a content item's journey (newest event on top), shows the status with separate Overdue / Approval-bypassed tags and a D-n deadline countdown, and puts the role-correct actions on the in-progress step: an **admin** sees **Approve** and **Minta Revisi** (opening an auto-focused revision-note form whose **Kirim** stays disabled while the note is empty or whitespace-only); a **creator** sees the submit/resubmit/link buttons the backend already allows, which hand back to the existing submit modals. It opens from the review queue's *Lihat Detail*, Content Plan rows, Creator Detail history rows, Task Saya rows, and a `?content=<id>` deep link (the notification/dashboard hook). Backend: a new content-keyed detail read — `GET /contents/:id` (admin) and `GET /me/contents/:id` (creator-scoped, 404 not 403 for foreign content) — answering in one nested query. The old submission-keyed Draft Preview modal was retired; one panel now serves every surface.

---

**1. TDD & Code Coverage**

*   **TDD:** strict Red-Green, **18 commits (8 RED, 10 GREEN)** in 9 pairs:
    *   RED `8d333b7` → GREEN `e038674` — pure journey facts (waiting side, overdue tag, newest-first events)
    *   RED `8238de3` → GREEN `6668355` — both detail endpoints, creator-scoped
    *   RED `58ebf21` → GREEN `dedba55` — queue rows carry `contentId`
    *   RED `4d7a3f9` → GREEN `f5a9a58` — role-aware loader + adapter
    *   RED `0445f42` → GREEN `72c3797` — role-based commands, **Kirim gated on the note**
    *   RED `981e472` → GREEN `33040be` — panel shell, tags beside status, journey
    *   RED `899d5ea` → GREEN `42cd231` — queue migrates; Draft Preview retired (−1 314 lines)
    *   RED `74f15cb` → GREEN `22487be` — three touchpoints + `?content=` deep link
    *   GREEN `0188b2d` + `4ab51a1` — lint/TS gate cleanup and restored `/me` spec coverage
*   **Coverage:**
    *   Backend: **882 tests / 57 files pass**; every new file at **100 % lines**; the 100 % `src/me/**` threshold holds (`content-detail.ts` 100 % lines / 92.3 % branches — the two branch misses are defensive fallbacks: the `?? ''` on a note `hasNote` already proved non-null, and the id tie-break in the final event sort)
    *   Frontend: **864 tests / 71 files pass**; new files (`content-detail.test.ts`, `panel-actions.test.ts`, `content-detail-panel.test.tsx`) at 100 %; both linters and both `tsc` runs clean
*   **Scope:** positive (decision succeeds → refresh + close; panel opens from five surfaces), negative (404 → "tidak ditemukan", 500 → retry message, decision failure keeps the panel open with the backend's reason and the typed note), edge (whitespace-only note never submits, crafted id `../../me/contents` is encoded, injected unknown action kind renders without a component edit, journey order never re-sorted client-side)

---

**2. OO & SOLID Principles**

*   **Command** — `PanelCommand.canRun()`/`run()` (`frontend/src/lib/panel-actions.ts`): the subtask's AC *is* a canExecute predicate; the panel renders `disabled={!command.canRun()}` and holds no rules. The Kirim rule lives on `submitRevision`, proven by the test that disables on `""` and `"   "` and enables after real text.
*   **Strategy** — `actionsFor({role, detail, state, ports})` picks the command list by role + `waitingOn` facts; one renderer serves both roles. The creator branch **consumes the server's `creatorActions`** instead of re-deriving eligibility in the browser.
*   **Dependency Inversion** — the panel depends on the `ContentDetailLoader` port and `PanelActionPorts`, injected as props (`load = fetchContentDetail`, `ports = {}`); every test swaps a stub without mocking modules.
*   **Open/Closed** — the `actions` slot replaces the command list entirely; the OCP test renders an injected command kind the codebase has never seen with no component edit.
*   **Adapter / SRP** — `toContentDetail` owns the wire shape, `content-detail.ts` (backend) owns the facts, `panel-actions.ts` owns eligibility→commands, the component owns only render/state.

---

**3. Development Discipline & Git Flow**

*   18 descriptive commits on `role-based-actions-panel_155` (branched from `main` at `98e7638`), all 2026-10-09, no force-pushes; [RED]/[GREEN] convention throughout.
*   Example messages: `0445f42` [RED] *Expect role-based commands where Kirim stays disabled until the note says something* → `72c3797` [GREEN] *Choose the step's commands by role and gate each one behind its own canRun*.
*   PR to `main` pending push.

---

**4. Team Development Management & Peer Review**

*   Contracts locked with sibling subtasks before coding (C1 detail response shape, C2 newest-first order, C3 action endpoints unchanged, C4 `actions` slot, C5 `?content=` param) — the work was built against a committed fixture so it never waited on 6.1/6.2/6.3's merge dates.
*   One clobbered spec caught by running `test:cov` (not `test`): the pre-existing `/me` controller spec had been overwritten; restored as a merge (main's suite + the new endpoint's tests) in `4ab51a1`, and the missing `ContentDetailService` provider added so Nest's testing module resolves.
*   PR review not yet started — branch is local.

---

**5. Code Quality**

*   Backend `tsc` exit 0, `oxlint` clean (1 pre-existing warning in an untouched file); Frontend `eslint` clean, `tsc` exit 0 (after `next typegen` for pre-existing stale route types).
*   Coverage gate (`src/me/**` 100 %, global 80 %) passes: `npm run test:cov` → no threshold errors.
*   Net diff: 39 files, **+2 516 / −1 355** — the deletion is the retired Draft Preview stack, replaced by one panel.

---

**6. Security Awareness**

The panel is a new read surface and a new entry point into two existing decision endpoints, so five OWASP areas were treated as design inputs, not clean-up:

*   **OWASP A01 (Broken Access Control):** *Threat:* the panel is keyed by a content id that arrives from the URL, a row click, and a `?content=` deep link — every one of those is attacker-influenceable. *Controls:* (a) the creator route is scoped by the contract the **session resolved**, never by the id alone, and answers **404 rather than 403** so an id is never confirmed to exist (`backend/src/contents/content-detail.service.ts`, tests *"answers 404 when the content does not exist"* and *"answers 404 to a creator asking for somebody else's content"* — `8238de3`/`6668355`); (b) both routes reject a malformed UUID with **400 before any database access** (`ParseUUIDPipe`), proven by *"answers 400 for a malformed content id before the detail service is touched"* (`4ab51a1`); (c) an unauthenticated request is answered **401 with nothing read** — the restored `/me` spec pins both endpoints (*"answers 401 for the detail without reading anything when no creator is identified"*, `4ab51a1`); (d) the deep-link parameter is treated as an opaque id, never as a path (see A03).
*   **OWASP A03 (Injection):** *Threat:* a crafted id such as `../../me/contents` or `?content=../..%2Fadmin` could climb out of the intended route, and the journey payload carries creator-supplied links into the DOM. *Controls:* `fetchContentDetail` builds the path as a **fixed template + `encodeURIComponent(id)`** (`frontend/src/lib/content-detail.ts`, `4d7a3f9`→`f5a9a58`) — the test feeds `../../me/contents` and asserts the encoded path; there is no raw string interpolation of user input into any URL in the branch; queue filter values were already validated at the edge by `checkQueueQuery` (400 for anything the queue cannot hold), and this branch only added a `contentId` field to that already-checked response. Creator-supplied draft/video links inside the journey are rendered through **`safeHref`** (http/https only, no `javascript:`/`data:` schemes; anything else prints as inert text with an explanation, `33040be`), so a link stored in the database can never execute in an admin's browser.
*   **OWASP A04 (Insecure Design):** *Threat:* role-based buttons invite the illusion that the client enforces the workflow — a tampered client could call approve on a superseded draft, or revive a disabled Kirim. *Controls:* the design states the opposite explicitly (`panel-actions.ts` header comment): **the buttons are UX only; authority stays in the endpoints' compare-and-set guards** (`submission-review.service.ts`'s status-guarded `updateMany`, unchanged by this branch). The command layer's `canRun()` gates presentation, never security; the panel never optimistically marks a draft decided — a refusal (409/422) is rendered verbatim and the panel stays open (`33040be`). Choosing **404 over 403** for foreign content is itself a design-level decision: it removes the id-oracle an attacker would enumerate against.
*   **OWASP A05 (Security Misconfiguration / Information Exposure):** *Threat:* a dead gateway or a stack trace reaching an admin's screen; the backend's address leaking into the browser bundle. *Controls:* the panel renders errors only from the typed error chain — `DraftReviewActionError` forwards a message **only for 4xx** (responses below 500), anything else falls back to a fixed Indonesian string (`draft-review-actions.ts:44-48`, inherited from SCRUM-129), and the panel adds its own generic *"Terjadi kesalahan. Coba lagi."* for non-Error throws plus a fixed *"Gagal memuat konten..."* for load failures (`33040be`) — no server body is echoed raw. The fetch itself goes through the **same-origin `/api` proxy**, so `BACKEND_URL` stays a server-side runtime value and never enters the client bundle (inherited boundary, reused unchanged by this branch).
*   **OWASP A10 (Server-Side Request Forgery):** *Threat:* any new fetch surface is a chance to let input steer a request's destination. *Control:* every request this branch introduced targets a **fixed same-origin path template** (`/api/contents/<encoded id>` or `/api/me/contents/<encoded id>`, role choosing between two constants, never a variable host); user input reaches exactly one place — an encoded path segment — and never the scheme, host, or route structure. The one server-side request in the wider stack (`fetchSubmissionQueue`, SSR) takes its host exclusively from `process.env.BACKEND_URL` with user input confined to `URLSearchParams` values; this branch's `contentId` addition does not touch that boundary. No outbound request from user input exists in the branch at all.

---

**7. AI Literacy & Productivity**

*   **AI Tool(s) Used:** OpenCode, in a **two-agent workflow**: a **planning agent** and a **build agent**, orchestrated by me.
*   **Implementation Type:** AI-assisted mini-PRD authoring, then AI-executed TDD implementation with human-directed gates.
*   **Phase 1 — Planning agent → mini PRD:** the planning agent interviewed the subtask against the codebase and the prototype, then produced a mini-PRD before a single line of production code existed — `SCRUM-155-complete-plan.md` (scope and boundary versus sibling subtasks 6.1–6.5, five locking contracts C1–C5, eight workstreams of RED→GREEN steps, risk register, DoD mapping) and `SCRUM-155-design-patterns-solid.md` (which pattern each requirement sentence forces, with the proving test named per pattern). Its most valuable output was a negative finding delivered up front: the database could not answer two of the panel's questions (an approval timestamp, and whether a link was submitted inside the H-1 bypass window), which set the fixture-first strategy that let the whole subtask be built without waiting on 6.1/6.2/6.3's merge dates.
*   **Phase 2 — Build agent → execution:** the build agent consumed the mini-PRD and executed it verbatim — **18 commits in 9 strict RED→GREEN pairs**, contracts implemented against a committed fixture, followed by one full verification pass (**1 746 tests** across both apps, both linters, both typechecks) and a gate-fix cycle that `test:cov` exposed (a clobbered spec, restored in `4ab51a1`). I reviewed the plan, approved the contracts, and redirected once (per-commit vitest runs were dropped in favour of end-of-run verification to keep the loop tight).
*   **Impact & Proof:** the planning phase caught the two cross-subtask blockers and the status-vocabulary drift *before* they became rework; the build phase landed the panel, both endpoints, the queue migration and all five touchpoints in one session with every gate green. Complex logic the agent handled: deriving a truthful journey from a schema that stores only a mutable status — the approval event is emitted only while it is provable, and the two 6.2 tags stay `false` until their write-time columns exist, documented in code rather than faked.
*   **Estimated time saving vs manual implementation:** high for the execution phase (the equivalent of roughly a full sprint day of TDD commits and gate-chasing); the planning phase paid for itself twice — once in avoided merge conflicts with sibling subtasks, once in the review-proof scope boundary written into the PR.
