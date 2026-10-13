# Sprint [X] Week [Y] Part C - [Student Name]

**Author:** [Student Name] (NPM: [NPM])
**Period:** [Date Range]
**Repository:** https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management

**Scope of this reflection:** PBI-17 / SCRUM-122 (*Tabel Antrian Draft*), SCRUM-129 (*Tombol Approve & Minta Revisi*), and SCRUM-132 (*Modal Submit Link Video*) — 29 commits delivered through PR #39, PR #43 and PR #52.

---

## 1. Aptitude, Applying Knowledge

This sprint's work sat in the frontend data/UI layer, where the course material covers ordinary form and table implementations. The three items below were learned and applied on top of that baseline because the tickets demanded security and verification guarantees the standard approach does not provide.

### 1.1 OWASP API Security Top 10 applied to the *client* data layer, not only the backend

The team's security work up to this point lived in the NestJS backend. These three PBIs forced the same discipline into the browser code, because the frontend is where a malicious value first enters the application.

- **A01 — Broken Object Level Authorization / path manipulation.** Every dynamic id is now URL-encoded before it is concatenated into a route, so a crafted id such as `../../admin` cannot climb out of the `/submissions/` or `/contents/` path prefix:
  - `frontend/src/lib/draft-review-actions.ts:54-58` (`encodeURIComponent(submissionId)` in `approveSubmission` / `reviseSubmission`), introduced in commit `36388dd` (SCRUM-129).
  - `frontend/src/lib/video-submission.ts:66` (`encodeURIComponent(contentId)` in `submitVideo`), introduced in commit `552b030` (SCRUM-132).
- **A03 — Injection through link schemes.** The video link is parsed through the project's `safeHref` allow-list before use, so `javascript:` and `data:` URLs are rejected as invalid input instead of ever reaching an `href` (`frontend/src/lib/video-submission.ts:45-50`).
- **A05 — Information exposure in error responses.** A 5xx body is server- or gateway-authored and may describe internals, so it is never rendered to the admin; only a 4xx message written for the operator passes through, otherwise a fixed Indonesian fallback is shown (`frontend/src/lib/draft-review-actions.ts:44-49`).
- **Defense in depth rather than client-side-only validation.** `isSupportedVideoLink()` re-implements the backend `detectVideoPlatform` rule (exact host or subdomain of `instagram.com` / `tiktok.com` over http(s)) so the user is told immediately that a link is wrong and the submit button locks, while the backend remains the authority (`frontend/src/lib/video-submission.ts:40-58`, commits `7ace96c` → `e308558` → `75fe382` → `9e34438`).

**Why this goes beyond the standard requirement:** the task only asked for a working modal. What was added instead was untrusted-input handling at three separate layers (URL construction, scheme allow-list, error-surface control), plus a consciously documented decision that the client check is advisory and the server stays the gatekeeper.

### 1.2 Advanced Vitest techniques: framework-module mocking, typed mocks and slot-level integration tests

The default unit-test approach (render a component, assert markup) was insufficient for three problems that only appear in a real application:

- **Mocking framework modules.** The queue page pulls in `AdminNav`, which calls `usePathname()`; tested outside the router it throws. Commits `419c7b5` mock `next/navigation` and `next/link` so an entire App Router page can be exercised in isolation.
- **Typed mocks instead of `any`.** Commit `00a40b3` replaced explicit `any` casts in the submission tests with Vitest's `vi.mocked()`, which keeps the mocked function's real signature checked by the compiler — an `any` cast would have hidden exactly the kind of contract drift described in §1.3.
- **Slot / composition integration testing.** Commit `e7946f6` proves that `ReviewActions` renders *only* inside the `DraftPreviewModal` `actions` slot, stays hidden until the draft has loaded, and reports the decision upward — a behaviour no single-component test can observe.
- **Coverage used as a gate, not a score.** Commit `1ffe264` added the missing filter branches to reach **100 % coverage on every new queue file**; PR #43 and PR #52 both report ~100 % on their two new files with the suite at 428 and 521 passing tests respectively.

### 1.3 Contract-driven data layer (ports and adapters) plus the SSR/BFF secret boundary

- **The UI depends on a contract, not on `fetch`.** `VideoSubmitter` is a function type (`frontend/src/lib/video-submission.ts:33-38`) and the modal is written against it, so the tests inject a stub and the real HTTP implementation can be swapped without touching the component (commit `8851214`). The same split was reused for the review actions, which is why a backend failure can be simulated without a backend.
- **Discriminated result type instead of thrown exceptions.** `VideoSubmissionResult` and `DraftReviewActionError` carry the HTTP status and any `errors.videoLink` field message back to the caller, so a 422 renders beside the input while other failures render as an alert line and the typed link survives for retry (`frontend/src/lib/video-submission.ts:21-31`, `frontend/src/lib/draft-review-actions.ts:6-14`).
- **Server-only secret boundary.** `fetchSubmissionQueue` reads `process.env.BACKEND_URL` per call on the server and is never reachable from the browser, because the browser only talks to the same-origin `/api` proxy (`frontend/src/lib/submissions.ts:74-92`, commit `0f554be`). Reading the variable per request (not at module scope) keeps the runtime Cloud Run value instead of the value baked in at build time.
- **Defensive input parsing at the boundary.** `parseSubmissionPage` accepts only `[1-9]\d*`; anything else falls back to page 1 with a user-visible message rather than forwarding a value the API would answer with a 400 (`frontend/src/lib/submissions.ts:60-72`).

**Complex logic / edge cases handled this sprint:** repeated query parameters (`string[]`), invalid and negative page numbers, trailing slashes in `BACKEND_URL`, whitespace-only and multi-line revision notes, empty or non-JSON error bodies, double-click submission while a request is in flight (`aria-busy` + disabled footer buttons), a typed link that must be preserved after a failed request, and subdomain matching so `notinstagram.com` is not accepted as Instagram.

---

## 2. Grow Together, Communication, Knowledge Sharing

### 2.1 Ten structured code reviews on teammates' pull requests

GitHub records **10 formal reviews authored this sprint** — 9 `APPROVED` and 1 `COMMENTED` — on PRs #19, #27, #28, #33, #34, #36, #40, #48, #53 and #57. They were written as verification against the PRD rather than as approvals:

| PR | Author | Verdict | What the review actually checked |
|---|---|---|---|
| #34 | Bastian | APPROVED | Verified the atomic `updateMany` compare-and-set status guard for race safety, the extracted `draft-review.ts` + thin ports (`SubmissionReviewClient`, `DraftApprover`), the E2E race test, and reported **100 % Stryker mutation score on `src/submissions`** — i.e. the test *quality* claim was read and repeated, not just the coverage badge. |
| #40 | satrialeka | APPROVED | Confirmed the `toDraftPreview` adapter had been corrected to match the response schema of backend PR #36 — a cross-PR contract check between two teammates' work. |
| #27 | EvelynOct | **COMMENTED** | Did **not** approve: asked for the SonarQube / coverage failure to be fixed first, so the branch could not merge red. |
| #48 | Bastian | APPROVED | Reviewed the modularisation of `task-actions.ts` (`canSubmitDraft`, `canSubmitVideo`) for its reuse by upcoming SCRUM-108 / SCRUM-131. |
| #57 | Bastian | APPROVED | Reviewed the Google OAuth 2.0 PKCE flow and session handling against security expectations (SCRUM-70). |
| #19, #28, #33, #36, #53 | Bastian / EvelynOct | APPROVED | Checked each implementation against its plan/PRD, including the creator onboarding write, the review-feedback fixes, and the submission-detail endpoint contract. |

Two of those PRs (#34 and #40) were reviewed, approved and then **merged by me personally** once the test results were confirmed, which is what moved them into `main` during the 25 Sep integration window.

### 2.2 Two revision cycles on my own PRs — feedback received, analysed and applied

Reviewing and being reviewed were treated as the same loop:

- **PR #39 (SCRUM-122).** After the first push, the reviewer left four concrete findings: the SSR fetch used a relative `/api/...` URL and therefore returned "Antrian tidak bisa dimuat" even with the backend running; search/status filters only changed the URL without reaching the API; PRD 3.11's *Tipe* and *Overdue* filters were missing; and the *Tipe* column printed the raw enum instead of `Evergreen` / `Specific`. All four were implemented in commits `16aa5cc` → `0f554be` → `cf9d4ce` → `1ffe264` (14:58–15:39 UTC, 25 Sep), the reviewer replied *"udah implement rekomendasinya … ku approve"* at 15:45 UTC, and both SonarCloud quality gates passed.
- **PR #52 (SCRUM-132).** Two findings: the frontend expected the field `link` while the real backend contract sends `videoLink`, and the Instagram/TikTok rule existed only on the server so a wrong link was transmitted before being rejected. Both were corrected in commits `c783279` → `fd48c97` (response contract) and `7ace96c` → `e308558` → `75fe382` → `9e34438` (client-side platform rule) between 16:20 and 16:34 UTC, acknowledged with *"revision done"* at 16:38 UTC, and approved by both reviewers at 16:39 and 16:49 UTC.

### 2.3 Knowledge sharing and its effect on the team

- **Written PR documentation as a shared artifact.** PR #52's *Additional Notes* publish the full SCRUM-131 endpoint contract (routes, status codes, body shapes, error envelopes) so the teammate who builds the backend has an agreed target; PR #43 documents the scope boundary between `feat/tabel-antrian-draft_122` and the review-actions branch so neither merge conflicts.
- **Testable patterns propagated.** The injectable `VideoSubmitter` port and the `RED`/`GREEN` commit convention were reused from the earlier draft-submission work and are now the template the modal PRs follow.
- **Effect on velocity and quality.** The two review cycles caught defects that unit tests could not: a response-field mismatch that would have shipped a silently broken error message (the mocks agreed with the wrong assumption, so every test still passed), and an SSR fetch bug that only appeared against a live backend. Reviews on #34 and #40 explicitly verified mutation and coverage results before merge, which kept broken or weakly tested work out of `main`.

---

## 3. Commitment, Work Ethic

### 3.1 Tickets completed

| Ticket | Deliverable | PR | Result |
|---|---|---|---|
| SCRUM-122 (PBI-17) | Draft review queue table at `/admin/submissions`: data layer, table, filters, pagination, error/empty states | #39 | 13 commits, merged, SonarCloud quality gate passed (backend + frontend) |
| SCRUM-129 (PBI-17) | Approve / Minta Revisi actions inside the Draft Preview modal, wired to the two review endpoints | #43 | 5 commits, merged, quality gate passed |
| SCRUM-132 (PBI-20) | Submit Link Video modal for creators: read-only content info, required link, platform validation, error recovery | #52 | 11 commits, merged, quality gate passed |

All three were delivered inside the sprint's implementation window (25–26 Sep) with the reviewer's requested changes applied **before** merge rather than deferred as follow-up work.

### 3.2 Disciplined engineering practices used to hit that quality level

- **Strict Test-Driven Development.** Every one of the 29 commits follows the `RED` → `GREEN` micro-cycle: 12 failing-test commits written first, 17 implementation/refactor commits following them. No production change landed without its test already existing.
- **Coverage as a gate.** `1ffe264` drove the new queue files to 100 % coverage; PR #43 and PR #52 report 428 and 521 passing tests with ~100 % coverage on both new files.
- **Automated quality gates.** SonarCloud reported *Quality Gate passed* on all three PRs; lint is run locally before push (a reviewer's lint finding on #39 was addressed in the same session).
- **Honest scope control.** Each PR records an explicit scope boundary and the deferred items (`[TODO: Friend]`), so work was closed out cleanly instead of being left half-wired.

### 3.3 Time log — 17.0 hours

| Activity | Hours | How I got the number |
|---|---|---|
| Coding & implementation | 6.0 | Traced from the 29 commits on SCRUM-122/129/132 (13 + 5 + 11; PRs #39/#43/#52). First-to-last commit spans total **4 h 25 m 06 s** (122: 2 h 34 m 45 s, 129: 0 h 13 m 06 s, 132: 1 h 37 m 15 s); splitting each span into blocks that start again after 60 minutes of inactivity gives the contiguous coding sessions, and the remainder covers work written before each commit plus the two review-driven revision rounds (PR #39 → 4 commits, PR #52 → 6 commits). Lower bound: some pre-commit editing is not visible in git. |
| Testing (unit / TDD / coverage) | 4.0 | The 12 `[RED]` commits are tests written *before* any implementation, plus the coverage push in `1ffe264` (100 % on all new queue files), the `vi.mocked` conversion in `00a40b3`, the router-mocking fix in `419c7b5`, and the slot integration test in `e7946f6`. Ends with 428 (PR #43) and 521 (PR #52) tests passing and coverage ≥ 80 % on new code. |
| Code reviews & PR write-ups | 4.5 | 10 formal reviews on teammates' PRs (#19, #27, #28, #33, #34, #36, #40, #48, #53, #57) at ~25 min each: check out the branch, read the diff against the PRD, read the reported test/mutation results (e.g. #34: 100 % Stryker mutation score on `src/submissions`; #30: 59 tests passing) and write a specific review body. Plus 3 detailed PR write-ups (#39, #43, #52) with summary, step-by-step test instructions, scope boundaries and checklists. |
| Sprint planning & discussions | 2.5 | Daily scrum attendance and stand-up follow-ups, sprint/backlog alignment on the PBI-17 and PBI-20 split between branches, PRD clarifications raised directly in review threads (e.g. the missing *Tipe* / *Overdue* filters on #39), and one client-facing UAT session on the queue and Task Saya flows. |
| **Total** | **17.0** | Sum of the four rows above. |
