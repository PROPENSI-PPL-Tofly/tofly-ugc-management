**Weekly Summary Report**

**Subtasks Completed This Week**

**[Adjustment Form & Finalize Modal — SCRUM-163]** Built the two moves an admin makes on a running invoice, opened from a creator's invoice in the Rate & Invoicing table's **Rincian** panel: **+ Tambah Penyesuaian** (an amount and a reason with a 500-character counter, both mandatory, every mistake said below its own field in the backend's own words so the form and `checkManualAdjustment` never disagree) and **Finalize** (a confirmation showing the whole breakdown and the total before anything is frozen). Added adjustments appear in the breakdown as `+Rp…` / `− Rp…` with reason and moment, and a frozen invoice is marked **Final** with both moves gone. Freezing is withheld, with its reason, while the contract still runs ("Bisa difinalisasi setelah kontrak berakhir" — an early end counts, the server's strict `today > endDate` rule) or while a part still waits for data (the `INVOICE_DATA_INCOMPLETE` blocker made visible instead of a surprise 409). The two moves post through 12.1's endpoints (`POST /invoices/:contractId/adjustments`, `POST /invoices/:contractId/finalize`) with the browser's session, and a refusal is a result rather than an exception — the modal stays open with the server's message, nothing is optimistic, and the frozen breakdown renders the snapshot verbatim (the mapping renames and never recomputes). Delivered on `feat/adjustment-form-finalize-modal_163`, PR #105 merged into `feat/pbi-12-finalize-invoice`.

---

**1. Test-Driven Development & Code Coverage (CPL 6)**

*   **TDD Process:** Followed strict Red-Green-Refactor cycle for **12** commits across the subtask:
    *   **5 RED commits** — failing tests written first for: the adjustment form's rules and the two moves' gates in the backend's own words (amount mandatory, non-zero, at most two decimals; reason mandatory and at most 500 characters), the path guards and the refusal-as-answer behaviour of the two server actions, the row carrying its contract id, contract end, adjustments and freeze moment through the seam, the form and the finalize confirmation saying every mistake below its field and knowing when each move is offered, and the breakdown listing the adjustments and marking a frozen invoice Final with the two moves beside Tutup
    *   **5 GREEN commits** — minimum implementation to pass: `invoice-adjustment.ts` as one pure rules module, `invoice-actions.server.ts` + `backendPost` posting the two moves with the session and reading a refusal as an answer, `RawAdjustment`/`snapshot`/`dataWaiting` carried through the `invoice-api.ts` seam, `AdjustmentForm` + `FinalizeModal` + `InvoiceActions` opening them, and the `AdjustmentLines` breakdown section + the **Final** pill + the panel's action slot
    *   **2 FIX commits** — `06aac4a` named the form's fields by their labels, wrote deductions the app's one way and gave the invoice moves their own refresh callback; `0e245a4` marked the invoice actions as server actions so `next/headers` never reaches the browser bundle
    *   (the branch carries nothing else this week — no `test`/`docs`/chore commits of my own, and 12.1's commits below `b1f6e85` are the teammate's, untouched)
*   **Test Coverage Level:**
    *   Backend: N/A this week — SCRUM-163 is frontend-only (the two endpoints came from 12.1, PR #104, and are read through the typed seam)
    *   Frontend: **100% statements, branches, functions and lines** on the rules module and the presentational pieces (`invoice-adjustment.ts`, `adjustment-form.tsx`, `finalize-modal.tsx`, `adjustment-lines.tsx`); 63 new tests across 5 new and 8 extended test files (26 files changed, +1,741 lines); whole frontend suite at **99.86% statements, 99.6% branches, 99.63% functions, 99.84% lines** (137 files, 2,410 tests), above the 80% CI threshold — the last uncovered spots are named in the PR rather than hidden: four dialog/answer-shape fallbacks in `invoice-actions.tsx` (68–74) and `invoice-actions.server.ts` (37, 39, 59, 74), kept for a follow-up `test(frontend)` commit and never covered with coverage suppressions
*   **Scope of Testing:** Positive tests (the form counts the reason and sends the amount and the trimmed reason; the finalize confirmation shows the four parts, the adjustments and the total; both moves are offered once the contract has ended; the breakdown lists each adjustment and a frozen invoice reads **Final**); negative tests (an empty form says what was left empty below each field and sends nothing; a non-admin and a non-UUID contract id are refused before any request; a 422's field errors land below their fields; a refusal keeps the modal open with the server's words; a frozen invoice offers neither move); edge cases (a reason of exactly 500 characters passes and 501 fails counting characters and not UTF-16 units, a contract that ended early counts as ended while the last day itself does not, a bonus waiting for data holds the freeze button with its reason, a blank or wrong amount reads as no number rather than zero, an API answer that predates the new fields lists no adjustments and no freeze, and a frozen breakdown shows the amounts as frozen with formula and snapshot disagreeing in the fixture)
*   **PR Links:** [#105 (SCRUM-163)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/105)
*   **Example of TDD:**
    *   [`c294727` [RED] Expect a manual adjustment to be checked in the backend's own words, and the two invoice moves to know when they are allowed](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/c294727)
    *   [`706266b` [GREEN] Hold the adjustment form's rules and the invoice moves' gates in one pure module](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/706266b)
    *   Matching pairs also used for the other units: [`e15c9c6` [RED] · `e7501a2` [GREEN] (the guarded, session-carrying invoice moves)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/e15c9c6) and [`6df84c6` [RED] · `91e8731` [GREEN] (the contract, adjustments and freeze carried through the seam)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/6df84c6) and [`703746a` [RED] · `5e682d3` [GREEN] (the adjustment form and the finalize confirmation)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/703746a)
*   **Corner Cases:**
    *   **A refusal is an answer, not an exception:** `INVOICE_FINALIZED`, `CONTRACT_NOT_ENDED`, `INVOICE_DATA_INCOMPLETE` and `CONTRACT_NOT_FOUND` each read for the admin in the same words the backend says them — the modal stays open instead of vanishing on a 409 ([`e7501a2`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/e7501a2))
    *   **The form and the server never disagree:** the amount rule and the 500-character reason cap live in one pure module and are checked again in the server action, so a client that skipped the form hears exactly what the form says ([`c294727`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/c294727) / [`706266b`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/706266b))
    *   **The last day is not "ended":** freezing follows the backend's strict `today > endDate`, so an early-ended contract may freeze on its last day while a running one is refused with the reason shown, never guessed at ([`706266b`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/706266b))
    *   **The mapping renames and never recomputes:** a frozen invoice renders the snapshot's amounts verbatim — regression-tested with a fixture where the formula and the snapshot disagree, so a recompute could never hide behind a green suite ([`91e8731`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/91e8731))
*   **Coverage:**
    *   SonarQube: Quality Gate passed for `tofly-ugc-management frontend` and `tofly-ugc-management backend` on PR #105 (96.0% coverage on new code frontend, 100% backend)
    *   Local: 137 files / 2,410 tests / 99.86% statements, 99.6% branches, 99.63% functions, 99.84% lines (`npm run test:cov`)

---

**2. Programming Best Practices, OO & SOLID Principles (CPL 6)**

*   **Principles / Patterns Applied:** Single Responsibility Principle (one pure module owns the rules, one owns the wire, one owns the moves), Dependency Inversion (time and the backend call injected, not read inside), Open/Closed (the refusal-code map and the per-field error map), DRY (one validation, one amount label, one adjustment-lines component), Adapter pattern (API ↔ page translation that renames and never recomputes)
*   **Implementation Details:** Each module owns one concern — `invoice-adjustment.ts` only owns what a manual adjustment must say, when a move is allowed and what a refusal means, and is pure (no `next/headers`, no fetch) so the forms stay presentational and the rules are tested without a DOM; `invoice-actions.server.ts` only owns the two guarded POSTs and the outcome type (a refusal is a result, not an exception); `invoice-api.ts` only owns `RawAdjustment` and its mapping; `AdjustmentForm`, `FinalizeModal` and `InvoiceActions` own presentation only. The seam is the DIP boundary: the moves depend on `backendPost`, not on HTTP mechanics, and time is passed in as an argument (`today = jakartaDay()` on `InvoiceActions`) so the freeze gate is tested across days without mocking clocks. OCP shows in `refusalMessage`'s code map (a new lifecycle code is added in one switch, and an unknown one stands as sent) and in `AdjustmentErrors`' per-field map. DRY shows in `validateAdjustment` shared by the form and the server action, `adjustmentLabel` shared wherever an adjustment is written, and one `AdjustmentLines` component rendered in both the Rincian panel and the finalize confirmation. The adapter maps 12.1's words onto the page's (`raw.contract.id` → `contractId`, `snapshot.finalizedAt` → `frozenAt`, `waiting_for_data` → `dataWaiting`) and never recomputes a total. The client/server boundary mirrors `draft-review-actions.ts`: `"use server"` actions, session forwarded server-side only.
*   **Commit Links:** [`706266b`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/706266b) (the rules in one pure module), [`e7501a2`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/e7501a2) (the injectable, session-carrying move seam), [`91e8731`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/91e8731) (the adapter carrying contract, adjustments and freeze)

---

**3. Development Discipline & Git Flow (CPL 6)**

*   **Git Flow Adherence:**
    *   Created feature branch `feat/adjustment-form-finalize-modal_163` from the tip of 12.1's `feat/finalize-creator-invoices_12-1` (`b1f6e85`), the subtask this one is built on
    *   12 descriptive commits following [RED]/[GREEN]/[FIX] convention (5 RED, 5 GREEN, 2 FIX), nothing else on the branch
    *   Commits made in one session 2026-10-18 23:03 → 2026-10-19 00:04 WIB; the branch was fast-forwarded onto 12.1's tip before review rather than rebased, and was never rewritten — no forced pushes this week
    *   Merge requests created to the integration branches: **PR #105 merged** into `feat/pbi-12-finalize-invoice` (19 Oct, merge commit `13575f2`) after both reviewers approved — the target base was declared in the PR body ("this PR's commits are the ones after `b1f6e85`", the base switching to the PBI-12 integration branch once 12.1's PR #104 landed) rather than moved silently
    *   Built on the teammate's 12.1 instead of re-implementing it: her commits stay hers below `b1f6e85`, the seam (`RawAdjustment`, `snapshot.finalizedAt`) was agreed with her before her endpoints merged, and the drift-guard test pins the fixture to her API's field set so the two halves cannot drift apart unnoticed
*   **Descriptive Commit Messages:**
    *   `c294727` [RED] Expect a manual adjustment to be checked in the backend's own words, and the two invoice moves to know when they are allowed
    *   `e15c9c6` [RED] Expect the adjustment and finalize actions to guard their paths and read a refusal as an answer
    *   `6df84c6` [RED] Expect a row to carry the contract, its adjustments and the moment it was frozen, and a frozen breakdown to show what was frozen
    *   `d8e7657` [GREEN] List the adjustments in the breakdown, mark a frozen invoice Final, and hand the two moves the panel's action slot
    *   `0e245a4` [FIX] Mark the invoice actions as server actions, so next/headers never reaches the browser bundle
*   **Pull Request Links:** https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/105

---

**4. Team Development Management & Peer Review (CPL 3)**

*   **Assigned Issues:** SCRUM-163 (Build the manual adjustment form and the finalize confirmation, PBI-12 subtask 12.2)
*   **Code Review Conducted:** Conducted a deep peer review of the teammate's PR #104 (subtask 12.1, the manual-adjustment and finalization endpoints this subtask consumes): checked all three acceptance criteria against the artifact — an adjustment bound to a still-running invoice with strict reason/decimal validation and the actor and timestamp left to the server, the finalize guard on Jakarta's calendar day with double-finalize race safety through a `FOR UPDATE` row lock, and the snapshot locking the breakdown after finalize — and found one real defect the green suite did not show: the Prisma index differed between the migration file and `schema.prisma`, which would fail the team's next `prisma migrate`. Reported with the fix (`prisma db pull` & `generate`); the author ran it and confirmed the schema now matches the agreed artifact, and the PR was approved and merged on 18 Oct. On my own PR #105, both reviewers approved; EvelynOct's two performance findings (the panel closing and refetching everything after a move although the POST already answers with the new adjustment, and `read.current.clear()` dropping every creator's breakdown cache when one invoice changed — and an adjustment changing no breakdown at all) were accepted as the first two items of the 12.3 follow-up on her approval as-is, rather than rewritten under an approved review.
*   **Reviewed Merge Request Links:** [#104](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/104) · [#105](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/105)

---

**5. Code Quality Measurement (CPL 6)**

*   **SonarQube / Code Quality Results:**
    *   Frontend & backend: 0 new issues, 0 security hotspots, 0.0% duplication on new code; SonarCloud Quality Gate **passed** for both `tofly-ugc-management frontend` and `tofly-ugc-management backend` on PR #105 (96.0% coverage on new code frontend, 100% backend)
    *   The subtask passes the 80% line coverage threshold enforced by CI — held at **99.86% statements, 99.6% branches, 99.63% functions and 99.84% lines** locally (137 files, 2,410 tests) at the PR head, with the four remaining spots named and disclosed (dialog and answer-shape fallbacks) instead of suppressed; lint clean and `tsc --noEmit` clean on the branch
*   **Proof of Quality:** [placeholder]

---

**6. Security Awareness (CPL 6)**

*   **Security Controls Applied:**
    *   **Validation repeated at the server boundary:** the whole amount rule (mandatory, non-zero, at most two decimals) and the 500-character reason cap live in one pure module and run in the form *and* again in the server action, in the backend's own words — a client that skipped the form hears exactly what `checkManualAdjustment` says (OWASP A08)
    *   **Path guards before any request:** `isUuid(contractId)` and an `admin` role check refuse before `backendPost` is ever called, answering "Invoice tidak ditemukan." / "Hanya admin yang dapat mengubah invoice." — a crafted id or a non-admin never reaches the backend (OWASP A01, A03)
    *   **No secret leakage:** the two moves are marked `"use server"` so `next/headers` and the session cookie stay out of the browser bundle (`0e245a4`); the backend host comes only from `process.env.BACKEND_URL` through one fixed path template with a validated id
    *   **Honest failure surfaces:** a refusal is a result, not an exception — the modal stays open with the coded message read for the admin, a 5xx says only "Permintaan tidak dapat diproses. Coba lagi.", and nothing is optimistic: the admin never sees an adjustment or a freeze the invoice does not have
*   **Vulnerability Mitigations:**
    *   OWASP A01 (Broken Access Control): both moves are admin-gated before any request and refuse a non-UUID contract id with the not-found wording rather than widening the path
    *   OWASP A03 (Injection): the POST body is JSON built from validated fields (a signed number with at most two decimals, a trimmed reason capped at 500 characters counted as characters) through fixed path templates — nothing string-built reaches the API
    *   OWASP A05 (Security Misconfiguration) / information disclosure: 5xx bodies never reach the admin — only messages written for the operator pass through, and an unknown refusal code keeps the server's own words
    *   OWASP A08 (Software and Data Integrity Failures) / A10 (Mishandling of Exceptional Conditions): a frozen breakdown renders the snapshot verbatim (the mapping renames and never recomputes), and every thrown or unreadable response collapses to one generic answer instead of a blank or lying modal
*   **Commit Links:**
    *   [`c294727`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/c294727) — checks a manual adjustment in the backend's own words and caps the reason before anything is posted (A03)
    *   [`e15c9c6`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/e15c9c6) — guards both moves with an id check and an admin check before any request (A01)
    *   [`e7501a2`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/e7501a2) — posts through one session-carrying call and reads a refusal as an answer, leaking no server internals (A05)
    *   [`0e245a4`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/0e245a4) — marks the invoice actions as server actions so `next/headers` never reaches the browser bundle (A05)

---

**7. AI Literacy & Productivity (CPL 7)**

*   **AI Tool(s) Used:** OpenCode
*   **Implementation Type:** AI Agents used for code generation, test writing, TDD cycle execution, code review, and git workflow management.
*   **Impact & Proof:**
    *   AI generated 12 commits following strict TDD discipline (5 RED/GREEN pairs + 2 FIX) in a single evening, with lint + `tsc` + full green suite + build verified as one finish gate before each push — PR #105 green, approved by both reviewers and merged the next day.
    *   The AI handled three pieces of complex work: (1) the shared rules seam — one pure module whose wording is the backend's own (`checkManualAdjustment`, `invoice-lifecycle`), so the form and the server action can never tell an admin two different things about the same mistake, including the character-vs-UTF-16 counting of the reason; (2) the refusal-as-result mapping that reads 12.1's coded refusals for the admin while keeping 5xx bodies behind one generic sentence, with the validation repeated server-side; (3) the freeze gate and frozen-snapshot semantics — Jakarta's calendar day passed in as an argument, the strict `today > endDate` rule with early ends counted, the waiting-data blocker made visible before the server would refuse, and a regression test with a fixture where the formula and the snapshot disagree so the mapping can never silently recompute. It also conducted the deep review of PR #104 that found the Prisma index drift between the migration and `schema.prisma`.
    *   Estimated 70% time reduction compared to manual TDD implementation.
