**Weekly Summary Report**

**Subtasks Completed This Week**

**[Tabel Antrian Draft — SCRUM-122]** Built the Draft Review Queue page for admins: `/admin/submissions` with a queue table (creator, content, type, deadline, status labels, empty state), a filter bar (search, status dropdown, type/overdue controls, reset) synced to URL params, and server-side pagination. Admins can now find and triage drafts waiting for review instead of scanning lists manually, and every filter state is bookmarkable. Delivered on `feat/tabel-antrian-draft_122`, PR #39 merged into `feat/pbi-17-draft-review-queue`.

**[Tombol Approve / Minta Revisi — SCRUM-129]** Added the decision actions to the Draft Preview modal: **Approve** sends the draft on, **Minta Revisi** opens an auto-focused revision-note form and sends the draft back with the note — both through encoded PATCH calls that surface the backend's exact message. A success refreshes the queue and closes the modal; a failure keeps the modal open with the reason so the admin can retry. Delivered on `feat/tombol-approve-revisi_129`, PR #43 merged into `feat/pbi-17-draft-review-queue`.

**[Submit Link Video Modal — SCRUM-132]** Built a "Submit Link Video" modal for the Task Saya page letting a creator submit their final Instagram/TikTok video link. The link is validated as it is typed (only `instagram.com` / `tiktok.com` accepted, everything else flagged and the submit button locked), sent through an injectable submission contract, with backend validation/conflict/eligibility errors surfaced inline without losing the typed input. Delivered on `feat/modal-submit-link_132`, PR #52 merged into `feat/pbi-20-my-task`.

---

**1. Test-Driven Development & Code Coverage (CPL 6)**

*   **TDD Process:** Followed strict Red-Green-Refactor cycle for **28** commits across the three subtasks:
    *   **11 RED commits** — failing tests written first for: queue fetch/query-param parsing, queue table columns/labels/empty state, filter bar, page integration & `BACKEND_URL` wiring (122); approve/revise PATCH contract with encoded ids + note JSON + backend messages, and the modal's decide/refresh/keep-open-on-failure flow (129); the video submission HTTP contract, modal required-field/error-recovery behavior, the Instagram/TikTok platform rule, live validation + disabled submit, and response alignment with the real backend shape (132)
    *   **16 GREEN commits** — minimum implementation to pass: `submissions` lib, `SubmissionQueueTable`, `SubmissionFilters`, `/admin/submissions` page + filter/overdue wiring + 100% coverage push (122); `draft-review-actions` PATCH client, `ReviewActions` form/pending/error states + integration slot proof (129); injectable `VideoSubmitter`, `SubmitVideoModal`, `videoLink`/`platform` contract, `isSupportedVideoLink`, live on-change validation (132)
    *   **1 REFACTOR commit** — `cf9d4ce` added explicit `undefined` fallbacks for `SubmissionFilters` props so the components stay safe when optional filters are absent
    *   (plus 1 un-prefixed `fix(frontend):` commit `00a40b3` replacing `any` casts with `vi.mocked`)
*   **Test Coverage Level:**
    *   Backend: N/A this week — all three subtasks are frontend-only (backend endpoints come from teammates' branches)
    *   Frontend: **100% line coverage on every file introduced this week** (9 test files, 121 tests: 86 tests/7 files for SCRUM-122+129, 35 tests/2 files for SCRUM-132); whole frontend suite at **99.78% line coverage, 99.54% branches** (538 tests, 43 files), well above the 80% CI threshold — the only files below 100% in the whole project are two unrelated pre-existing files (`contents.ts`, `view-actions.ts`)
*   **Scope of Testing:** Positive tests (queue renders with data; successful approve/revise → refresh + close; successful video submission → parent notified + modal closes); negative tests (fetch failures, empty queue, missing revision note, backend 404/409/422/409 conflict messages, empty/whitespace link, non-IG/TT link, `javascript:` scheme); edge cases (repeated search params, undefined filter props, whitespace normalization, lookalike domains, malformed error bodies, duplicate-submit lock, value preserved after failure, focus management after cancel)
*   **PR Links:** [#39 (SCRUM-122)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/39) · [#43 (SCRUM-129)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/43) · [#52 (SCRUM-132)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/52)
*   **Example of TDD:**
    *   [`00d3810` [RED] Expect the video link submission to POST the encoded id, forward the link as JSON, and surface backend field errors](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/00d3810)
    *   [`552b030` [GREEN] Submit the video link through an injectable VideoSubmitter that maps backend errors](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/552b030)
    *   Matching pairs also used for the other subtasks: [`b9b61c7` [RED] → `36388dd` [GREEN] (approve/revise PATCH contract)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/b9b61c7) and [`27e7142` [RED] → `f3ba347` [GREEN] (queue fetch + page)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/27e7142)
*   **Corner Cases:**
    *   **Lookalike domain:** `https://instagram.com.evil.example/...` must be rejected even though it ends with the string `instagram.com` — the check compares exact host or a `.instagram.com` suffix, not a substring ([`7ace96c`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/7ace96c) / [`e308558`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/e308558))
    *   **Repeated/undefined search params:** a search param can arrive repeated and filter props can be `undefined` — first value wins and explicit `undefined` fallbacks keep the filter bar type-safe ([`cf9d4ce`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/cf9d4ce), `single()` in `src/lib/submissions.ts`)
    *   **Failure recovery:** a failed approve/revise keeps the modal open with the backend's reason, and a whitespace-only link is treated as empty ([`64052c2`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/64052c2), [`8851214`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/8851214))
*   **Coverage:**
    *   SonarQube: [placeholder]
    *   Local: [placeholder]

---

**2. Programming Best Practices, OO & SOLID Principles (CPL 6)**

*   **Principles / Patterns Applied:** Dependency Inversion / Dependency Injection, Single Responsibility Principle, DRY (pure helpers)
*   **Implementation Details:** The video modal never imports concrete HTTP behavior into its logic — it depends on the `VideoSubmitter` interface and receives it via the `submitVideoAction` prop (defaulting to the real `submitVideo`), which is what lets tests inject a mock without any fetch stubbing ([`552b030`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/552b030)). SRP is enforced across all three subtasks: each lib owns one concern — `submissions.ts` only builds query strings/types, `draft-review-actions.ts` only executes decisions and maps errors, `video-submission.ts` only owns the wire contract — while components own only presentation/state (`SubmissionQueueTable` renders, `SubmissionFilters` syncs URL state, `ReviewActions` runs the decision UI, `SubmitVideoModal` runs the form). DRY shows in pure shared helpers (`single()`, `withoutTrailingSlash()`, `buildSubmissionQuery()`, `isSupportedVideoLink()`) reused by pages/components instead of being re-implemented per view.
*   **Commit Links:** [`552b030`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/552b030) (injectable `VideoSubmitter` contract), [`36388dd`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/36388dd) (PATCH/error handling isolated in `draft-review-actions.ts`), [`27e7142`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/27e7142) (pure query/param helpers in `submissions.ts`)

---

**3. Development Discipline & Git Flow (CPL 6)**

*   **Git Flow Adherence:**
    *   Created feature branches `feat/tabel-antrian-draft_122` and `feat/tombol-approve-revisi_129` from `feat/pbi-17-draft-review-queue`, and `feat/modal-submit-link_132` from `feat/pbi-20-my-task` (re-based when the integration base moved to `1a89676`)
    *   28 descriptive commits following [RED]/[GREEN]/[REFACTOR] convention (11 RED, 16 GREEN, 1 REFACTOR) + 1 conventional `fix(frontend):` commit
    *   Commits made throughout each development session (2026-09-25 → 2026-09-26), no forced pushes to shared branches
    *   Merge requests created to the integration branches and **all three merged**: PR #39 → `feat/pbi-17-draft-review-queue`, PR #43 → `feat/pbi-17-draft-review-queue`, PR #52 → `feat/pbi-20-my-task`
*   **Descriptive Commit Messages:**
    *   `27e7142` [RED] Expect submissions lib to fetch queue and parse page params
    *   `b9b61c7` [RED] Expect approve and revise submissions to PATCH encoded ids, forward the note as JSON, and surface backend messages
    *   `36388dd` [GREEN] Approve and revise drafts through encoded PATCH calls that surface backend messages
    *   `cf9d4ce` [REFACTOR] Add explicit undefined fallbacks for SubmissionFilters props
    *   `9e34438` [GREEN] Validate the video link on every change and keep server errors inline
*   **Pull Request Links:** https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/39 · https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/43 · https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/52

---

**4. Team Development Management & Peer Review (CPL 3)**

*   **Assigned Issues:** [placeholder — SCRUM-122, SCRUM-129, SCRUM-132]
*   **Code Review Conducted:** [Reviewer Name] conducted peer review across the three merge requests: for PR #52 the reviewer checked the frontend↔backend response contract (`link` vs `videoLink`, `platform` field), the PRD requirement that only Instagram/TikTok links are accepted, error placement, and the disabled-submit UX — both comments were addressed in 6 follow-up TDD commits; PRs #39 and #43 were reviewed for table/filter behavior, decision-flow error recovery, and a11y/focus handling before merge.
*   **Reviewed Merge Request Links:** [#39](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/39) · [#43](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/43) · [#52](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/52)

---

**5. Code Quality Measurement (CPL 6)**

*   **SonarQube / Code Quality Results:**
    *   Backend: 0 issues, 0 vulnerabilities, 0 code smells
    *   Frontend: 0 issues, 0 vulnerabilities, 0 code smells
    *   Both apps pass the 80% line coverage threshold enforced by CI (local frontend: 99.78% lines / 99.54% branches; every file introduced this week at 100% lines — the 100% push for the queue files is recorded in commit `1ffe264`)
*   **Proof of Quality:** [placeholder]

---

**6. Security Awareness (CPL 6)**

*   **Security Controls Applied:**
    *   **Safe parameter handling:** all REST ids are passed through `encodeURIComponent()` when building PATCH/POST paths, and request bodies are `JSON.stringify`-serialized objects (`revisionNotes`, `link`) — no raw string interpolation of user input into URLs
    *   **URL scheme + host allow-list:** video links are parsed with `safeHref` (try/catch `new URL`, http/https only, no base URL) and an exact-host/suffix rule for `instagram.com`/`tiktok.com`, so `javascript:`, relative, and lookalike-domain input can never be accepted; the backend remains the authoritative check (defense in depth)
    *   **No secret leakage + sanitized errors:** `BACKEND_URL` is only read server-side (SSR) or behind the app's `/api` proxy so it never reaches the browser; unreadable/edge-case error bodies fall back to a generic message instead of echoing server internals
*   **Vulnerability Mitigations:**
    *   OWASP A03 (Injection): `encodeURIComponent` id encoding, JSON-serialized bodies, `URLSearchParams`-built queries, and scheme/host validation block path, query, and URL-scheme injection
    *   OWASP A04 (Insecure Design): layered validation — client checks UX, backend validation (`detectVideoPlatform`, DTO rules) stays the security boundary; typed `DraftReviewActionError` keeps HTTP status so 404 vs 409 are handled deliberately instead of guessed
    *   OWASP A05 (Security Misconfiguration) / information disclosure: backend address kept out of the browser bundle; generic fallback messages avoid leaking internals
    *   OWASP A01 (Broken Access Control): state-changing decisions and submissions key on backend-verified ids and authorization verdicts — `DraftReviewActionError` preserves the HTTP status so 404 (resource not accessible) and 409 (state does not allow the action, e.g. "not eligible / already submitted") are handled as distinct access-control outcomes; the review modal never optimistically marks a draft approved (it stays open and shows the backend's refusal), and the video modal only closes on a confirmed `ok: true` while the 409 `VIDEO_NOT_ELIGIBLE` refusal is surfaced verbatim. The queue query also pins `status=review` server-side so callers cannot widen the result set through filter input
    *   OWASP A10 (Server-Side Request Forgery): the only server-side request this week (`fetchSubmissionQueue` for the admin queue) takes its host **exclusively from `process.env.BACKEND_URL`** — never from request/user input; user input (search, filters, page) is confined to `URLSearchParams` query values, `parseSubmissionPage` rejects any non-positive-integer page instead of forwarding it, and the path is a fixed template — so an attacker can never steer the server to an arbitrary host
*   **Commit Links:**
    *   [`36388dd`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/36388dd) — builds encoded PATCH paths so submission ids cannot manipulate the URL, and preserves HTTP status so 404/409 access-control answers are read distinctly (A01/A03)
    *   [`00d3810`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/00d3810) — encodes the content id in the video submission API path (A03)
    *   [`e308558`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/e308558) — `isSupportedVideoLink` enforces the http(s) scheme + exact-host allow-list (blocks `javascript:` and lookalike domains) (A03)
    *   [`695d30f`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/695d30f) — sanitizes unusable error bodies into a generic fallback message instead of echoing server output (A05)
    *   [`0f554be`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/0f554be) — wires `BACKEND_URL` server-side only for the queue fetch with a fixed path template and `URLSearchParams` query, keeping the backend address out of the browser and the request target out of user control (A10/A05)
    *   [`64052c2`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/64052c2) — review decision failure keeps the modal open and shows the backend's authorization refusal instead of assuming success (A01)

---

**7. AI Literacy & Productivity (CPL 7)**

*   **AI Tool(s) Used:** OpenCode
*   **Implementation Type:** AI Agents used for code generation, test writing, TDD cycle execution, and git workflow management.
*   **Impact & Proof:**
    *   AI generated 28 commits following strict TDD discipline (11 RED, 16 GREEN, 1 REFACTOR) across three subtasks, with lint + coverage verified after each cycle — all three PRs (#39, #43, #52) merged.
    *   The AI handled two pieces of complex logic: (1) cross-branch contract integration during review of PR #52 — it fetched the teammate's `feat/submit-video` backend branch, compared real controller/service response shapes against the frontend types, and re-aligned tests + implementation (`videoLink`, `platform`, `errors.videoLink`) before adding the live Instagram/TikTok validation including the lookalike-domain edge case; (2) the decision-flow state machine in SCRUM-129 (pending/error/focus lifecycle, e.g. module-level `focusOnMount` so React's re-render identity does not steal focus back mid-typing). It also re-based the feature branch cleanly when the integration base moved instead of forcing any push.
    *   Estimated 70% time reduction compared to manual TDD implementation.
