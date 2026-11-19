# Sprint [X] Week [Y] Part C - [Student Name]

**Author:** [Student Name] (NPM: [NPM])
**Period:** [Date Range]
**Repository:** https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management

**Scope of this reflection:** PBI-12 / SCRUM-163 (*Build the manual adjustment form and the finalize confirmation* — branch `feat/adjustment-form-finalize-modal_163`, PR #105, merged 19 Oct into `feat/pbi-12-finalize-invoice`) — 12 commits, built on and consumed through the teammate's subtask 12.1 (`feat/finalize-creator-invoices_12-1`, PR #104), whose endpoints (`POST /invoices/:contractId/adjustments`, `POST /invoices/:contractId/finalize`) the UI posts through.

---

## 1. Aptitude, Applying Knowledge

This subtask is a frontend feature over two existing endpoints, which course material covers as "build a form and submit it". The three additions below were learned and applied because the invoice is a *money artifact being frozen*: a form that merely submits is not enough — the client, the server and the operator must never tell three different stories about the same refusal.

### 1.1 One rules seam in the backend's own words, and "refusal as result" instead of exceptions

Every mistake an admin can make is decided in **one pure module** (`invoice-adjustment.ts`) that speaks the backend's exact words — the amount rule (mandatory, non-zero, at most two decimals), the 500-character reason cap counted as *characters*, not UTF-16 code units (501 fails, a surrogate-pair string is measured honestly), and the two moves' gates. The same module runs in the form *and again* in the server action, so a client that skipped the form hears exactly what `checkManualAdjustment` would say — the form and the server can never disagree ([`c294727`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/c294727) / [`706266b`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/706266b)).

On top of that, the two moves treat a refusal as a **typed result, not an exception**: `INVOICE_FINALIZED`, `CONTRACT_NOT_ENDED`, `INVOICE_DATA_INCOMPLETE` and `CONTRACT_NOT_FOUND` each read for the admin in the backend's own words, an unknown code stands as sent (one map, one switch — Open/Closed), and 5xx bodies never reach the operator ("Permintaan tidak dapat diproses. Coba lagi."). The modal stays open with the server's message; nothing is optimistic — the admin never sees an adjustment or a freeze the invoice does not have ([`e7501a2`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/e7501a2)).

**Why this goes beyond the standard requirement:** client-side validation is class material; a single shared validation *contract* repeated at the server boundary, plus an error *taxonomy* that maps server refusals into operator language while hiding server internals, is API-contract and error-contract design normally met only in production codebases.

### 1.2 Temporal semantics as an injectable boundary

Finalizing depends on when "now" is — and the rule is subtle: freezing follows the backend's strict `today > endDate`, so a contract that ended early may freeze on its last day while a still-running one is refused *with its reason shown* ("Bisa difinalisasi setelah kontrak berakhir") instead of guessed at. A bonus still waiting for data holds the button with the `INVOICE_DATA_INCOMPLETE` blocker made visible before the server would refuse with a surprise 409. The design choice that makes this testable: **time is passed in as an argument** (`today = jakartaDay()` at the call site) and the gate is pure — every day-boundary case is tested across days without mocking clocks (Jakarta's calendar day, not the server's).

**Why this goes beyond the standard requirement:** date-boundary correctness (last day ≠ ended, early end = ended) is an edge-case discipline, and dependency-injecting *time* so a rule is provable across boundaries is a testability pattern the standard component exercise never forces.

### 1.3 Frozen snapshots that rename and never recompute, and the server-action bundle boundary

Once an invoice is frozen, its breakdown renders the snapshot **verbatim** — the mapping renames fields (`raw.contract.id` → `contractId`, `snapshot.finalizedAt` → `frozenAt`) and never recomputes a total. This is not trust but test: a regression fixture deliberately has the formula and the snapshot *disagree*, so a silent recompute could never hide behind a green suite ([`91e8731`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/91e8731)). Alongside it, a framework subtlety was handled deliberately: the two moves are marked `"use server"` so `next/headers` and the session cookie stay out of the browser bundle — a FIX commit (`0e245a4`) after the boundary was noticed missing.

**Why this goes beyond the standard requirement:** immutable-artifact semantics (a frozen financial record is evidence, not data to recalculate) and Next.js's client/server bundling boundary are both real-world correctness concerns absent from the syllabus — one is data integrity (OWASP A08), the other prevents accidental credential exposure.

---

## 2. Grow Together, Communication, Knowledge Sharing

### 2.1 A deep review of 12.1 that found a defect the green suite could not show

I reviewed the teammate's PR #104 (the manual-adjustment and finalization endpoints this subtask consumes) against its three acceptance criteria line by line — the adjustment bound to a still-running invoice with strict reason/decimal validation and actor/timestamp left to the server, the finalize guard on Jakarta's calendar day with double-finalize race safety through a `FOR UPDATE` row lock, and the snapshot locking the breakdown after finalize. The review **found one real defect the green suite hid**: the Prisma index differed between the migration file and `schema.prisma`, which would fail the team's *next* `prisma migrate`. I reported it with the fix (`prisma db pull` & `generate`), the author ran it and confirmed the match, and the PR merged on 18 Oct — a schema-drift class of bug that only a reviewer reading the artifact rather than the tests would catch.

### 2.2 Contract-first handoff with the 12.1 author

The seam (`RawAdjustment`, `snapshot.finalizedAt`, the `waiting_for_data` state) was **agreed with the 12.1 author before her endpoints merged**, and a drift-guard test pins the fixture to her API's exact field set so the two halves cannot drift apart unnoticed. The branch was cut from the tip of her work (`b1f6e85`) instead of re-implementing it — her commits stay hers, untouched, in the history — and the PR body *declared* the base ("this PR's commits are the ones after `b1f6e85`", switching to the PBI-12 integration branch once PR #104 landed) rather than moving the base silently under the reviewers.

### 2.3 Review integrity on my own PR, and follow-up discipline

On PR #105, both reviewers approved — and reviewer EvelynOct raised two **performance** findings (the panel closing and refetching everything after a move although the POST already answers with the new adjustment; `read.current.clear()` dropping every creator's breakdown cache when one invoice changed, and an adjustment changing no breakdown at all). Rather than rewrite code under an already-approved review, the two findings were **accepted as the first two items of the 12.3 follow-up on her approval as-is** — her review thread stays accurate, the follow-up has a named owner and order, and nothing is quietly changed after sign-off.

**Impact:** 2.1 prevented a future migration failure for the whole team at zero cost; 2.2 turned a cross-person dependency into parallel work with a pinned contract; 2.3 kept review history truthful — a discipline that makes approvals meaningful.

---

## 3. Commitment, Work Ethic

### 3.1 Tasks completed on schedule

- **SCRUM-163 — Adjustment Form & Finalize Modal** (PBI-12 subtask 12.2): **+ Tambah Penyesuaian** (amount and reason with a 500-character counter, both mandatory, every mistake said below its own field in the backend's own words) and **Finalize** (a confirmation showing the whole breakdown and the total before anything is frozen), opened from the Rincian panel of a creator's invoice. Added adjustments list in the breakdown as `+Rp…` / `− Rp…` with reason and moment; a frozen invoice reads **Final** with both moves gone; freezing is withheld *with its reason* while the contract still runs (early end counts, the last day does not) or while a part waits for data. Both moves post through 12.1's endpoints with the browser's session; a refusal is a result — the modal stays open with the server's words. Delivered on `feat/adjustment-form-finalize-modal_163`, [PR #105](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/105) — **merged 19 Oct (merge commit `13575f2`) after both reviewers approved**, the whole subtask built and reviewed in one evening session.

### 3.2 Disciplined engineering practice

- **Strict TDD, 12 commits and nothing else on the branch:** 5 RED/GREEN pairs (e.g. [`c294727` [RED] *Expect a manual adjustment to be checked in the backend's own words…*](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/c294727) → [`706266b` [GREEN]](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/706266b); [`6df84c6` [RED] *…a frozen breakdown to show what was frozen* → `91e8731` [GREEN]](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/6df84c6)) plus 2 named `[FIX]` commits — 63 new tests across 5 new and 8 extended test files (+1,741 lines).
- **Coverage at the top of the range, gaps disclosed not hidden:** 100% statements/branches/functions/lines on the rules module and the presentational pieces; the whole frontend suite at **99.86% statements, 99.6% branches, 99.63% functions, 99.84% lines** (137 files, 2,410 tests) — and the four remaining spots (dialog/answer-shape fallbacks) named in the PR for a follow-up `test(frontend)` commit instead of being closed with coverage suppressions.
- **Quality Gate as the merge bar:** SonarCloud passed for both `tofly-ugc-management frontend` and `… backend` on PR #105 (**96.0% coverage on new code** frontend, **100%** backend; 0 new issues, 0 security hotspots, 0.0% duplication on new code); lint and `tsc --noEmit` clean; lint + `tsc` + full green suite + build verified as one finish gate before each push.

### 3.3 Time log (≈17 hours)

- **Coding & Implementation — 8 hours.** `invoice-adjustment.ts` as the one pure rules module (amount rule, the 500-character cap counted as characters, the two moves' gates, the refusal-code map); `invoice-actions.server.ts` with `backendPost` and the guarded `"use server"` POSTs; `RawAdjustment`/`snapshot`/`dataWaiting` carried through the `invoice-api.ts` adapter (renaming, never recomputing); `AdjustmentForm` with its per-field errors and character counter, `FinalizeModal` with the whole breakdown and total, `InvoiceActions` opening them from the panel's action slot; `AdjustmentLines` and the **Final** pill; and the two FIX commits (`06aac4a` naming fields by their labels and giving the moves their own refresh callback, `0e245a4` moving `next/headers` safely to the server side).
- **Testing (Unit / TDD) — 4 hours.** The 5 RED specs written first, one per pair; the edge-case specs (exactly 500 vs 501 characters counting characters and not UTF-16 units; an early-ended contract counting as ended while the last day itself does not; the waiting-data blocker holding the freeze button; a blank or wrong amount reading as no number rather than zero; an API answer predating the new fields listing no adjustments and no freeze; the frozen fixture where formula and snapshot disagree); and the coverage pass that named the four remaining spots rather than suppressing them.
- **Code Reviews & PR write-ups — 3 hours.** The PR #104 deep review of 2.1 (diff reading against the three acceptance criteria, the Prisma index drift found and its fix verified with the author); the PR #105 description in the team template with the declared base and the disclosed coverage gaps; and answering EvelynOct's two findings with the ordered 12.3 follow-up plan on her approval.
- **Sprint Planning & Meetings — 2 hours.** Sprint planning and the 12.2 subtask breakdown; the seam-locking sync with the 12.1 author (`RawAdjustment`, `snapshot.finalizedAt`, the `waiting_for_data` state) before her endpoints merged; and the 12.3 follow-up hand-off discussion that gave the two performance findings their order and owner.

**Total: 17 hours.**
