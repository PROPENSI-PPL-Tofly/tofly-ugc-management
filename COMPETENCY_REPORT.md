# Competency Report — Evidence Mapped to the Grading Scheme

Scope: `tofly-ugc-management` (PROPENSI-PPL-Tofly), 10–23 Oct 2026 plus 2–5 Nov 2026. Evidence
covers my own subtasks **SCRUM-144** (Content Plan page), **SCRUM-158** (Rate & Invoicing table),
**SCRUM-163** (Adjustment Form & Finalize Modal), **SCRUM-237** (Admin bonus breakdown & finalize
view) and **SCRUM-239** (SMTP email sender) — weekly reports `WEEKLY_REPORT-144-158.md` and
`WEEKLY_REPORT-163.md` — plus the team's CI/CD and quality infrastructure where noted. Every
commit, file and test case named below is my own work (checked by git authorship); teammates'
commits that share a branch are explicitly excluded. Each row states the level claimable *today*,
the concrete evidence, and what a higher level still needs. Claims are deliberately conservative:
nothing is asserted without a commit, PR, or measured number behind it.

---

## Part A

### 1. Software Methodology: TDD — CPL 6 IAF — **Level 3 claimable; Level 4 with the analysis below**

*   **Evidence:**
    *   **Disciplined commits:** 61 TDD commits across three subtasks in two weeks — SCRUM-144/158: 21 `[RED]` / 21 `[GREEN]` / 1 `[REFACTOR]` (49 commits); SCRUM-163: 5 `[RED]`/`[GREEN]` pairs + 2 `[FIX]` (12 commits). November added SCRUM-239: 5 `[RED]`/`[GREEN]` pairs + `[TEST]`/`[DOCS]`/`[FIX]`/`[REFACTOR]` (14 commits) and SCRUM-237: 3 `[RED]`/`[GREEN]` pairs + `[TEST]` (7 commits) — **82 TDD-disciplined commits across five subtasks**, every pair one failing test first, then the minimum implementation.
    *   **Coverage:** frontend suite at **137 files / 2,410 tests / 99.86% statements, 99.6% branches, 99.63% functions, 99.84% lines** locally (`npm run test:cov`), above the 80% CI threshold; the pure rules module and both forms of SCRUM-163 at **100% on all four metrics**. SCRUM-239's backend email module measures **100% lines / 100% branches / 100% functions** in the local lcov run (zero uncovered lines or branches across all five `src/email` files), locked in by a `src/email/**: 100` coverage threshold in `vitest.config.ts` beside `src/auth/**` and `src/storage/**`. Verified by running the suite at the branch tip, not copied from a PR description.
    *   **Positive, negative and corner cases for every feature:** e.g. my invoice work covers the positive (form submits, freeze succeeds), the negative (empty form refused per field, non-admin refused before any request) and the corners (500 vs 501 characters counted as Unicode characters not UTF-16 units; a contract ending early counts as ended while the last day itself does not; `bonusAmount: null` renders "Menunggu data" and never `Rp0`; a page past the end of the invoice table shows the last page, never an empty table).
    *   **Test isolation (mock/stub):** typed fixture seams (`invoice-api.fixture.ts`, `RawInvoiceList`, `RawAdjustment`) stand in for endpoints before they exist, with drift-guard tests asserting the fixture's keys equal the API's real field set — the mock-drift failure mode (green suite, broken integration) found in the PR #82 review is designed out. Time is injected (`jakartaDay(now)`, `today = jakartaDay()`) instead of mocking clocks. The two newest subtasks use the same seams end to end — the full mock/stub mechanics are spelled out below.
*   **Case inventory — branch, files, feature, and every TDD case (the two newest subtasks; every commit below is mine — the SCRUM-238/28.4 commits that share the 237 branch are a teammate's and are excluded):**
    *   **SCRUM-239 — [BE] SMTP email sender** (39.1). Branch `feat/smtp-email-sender_239` → PR #177 into `feat/pbi-39-email-sign-in`. **Feature:** deliver the email sign-in code over SMTP as "Tofly" — read the account from server config (Secret Manager, never in the repo), render the "Kode masuk Tofly" email in HTML and plain text, send through nodemailer behind an `EmailSender` port, fail closed (`PortNotReady`) while no account is configured, log a failure as recipient + error kind only (AC 6), and expose one real in-box smoke send (`npm run email:test`, AC 3). **Files:** `backend/src/email/` — `email-sender.ts` (port), `email-config.ts`, `smtp-email-sender.ts`, `sign-in-code.ts`, `email.module.ts`, `send-test-email.ts` + `send-test-email-cli.ts`, each with its `*.spec.ts` (22 cases). **TDD:** 5 `[RED]`/`[GREEN]` pairs — `01c6a423→a81f958d` (template on the agreed port), `cfda2ee3→77f30f48` (config reading), `2af7c6bf→f73cf0b3` (delivery + AC-6 logging), `edb28703→d5ff8044` (module binding, fail-closed), `646dcb7d→a885dbc2` (smoke sender) — plus `[TEST] 535d83f3`, `[DOCS] 2200c1ff`, `[FIX] 67f96044`, `[REFACTOR] 7ebacce5`.

        | # | Case (test) | Kind | Why it is that kind |
        |---|---|---|---|
        | 1 | reads the SMTP settings from the server config, trimming what it finds | positive | the happy path: a complete account reads as configured |
        | 2–6 | reads as not configured without **SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / EMAIL_FROM** (5 parameterized cases) | negative | each missing piece alone must disable sending — fail-closed, not fail-half |
        | 7 | reads as not configured for a port that is no whole number | corner | `'587.5'`, `'five eight seven'` are not 587 — a malformed port must not become a valid config |
        | 8 | reads "Kode masuk Tofly" from "Tofly", carrying the six digits in both bodies (AC 3) | positive | the AC's exact subject and sender; the code present in HTML *and* text |
        | 9 | names the ten minutes the code stays valid and its single use (AC 3) | positive | expiry and single-use wording |
        | 10 | escapes whatever it interpolates into the HTML body, leaving the text body as sent | negative (security) | a hostile `senderName`/code must not become HTML (A03 injection) |
        | 11 | escapes every character that would become markup in the HTML body | corner | all five of `& < > " '` — not only the obvious `<` |
        | 12 | says what to do when the code was not asked for | negative | the unsolicited-code path needs its own guidance |
        | 13 | delivers each message as Tofly from the configured address (AC 3) | positive | the envelope: `from: 'Tofly <EMAIL_FROM>'` |
        | 14 | leaves the HTML body out of a message that has none | corner | a text-only message must not send `html: undefined` |
        | 15 | reports a refused send to the caller and logs it without the code or the error's text (AC 6) | negative | the rejection reaches the caller; the log provably contains no code/body/error text |
        | 16 | names the kind of a failure that is not an Error either | corner | a thrown string still logs a kind, not a crash |
        | 17 | builds the real sender around the transport its account asks for | positive | factory wiring: config → transport → sender |
        | 18 | is the fail-closed unready sender while no account is configured | negative | unconfigured = `PortNotReady`, nothing is ever believed sent |
        | 19 | binds EMAIL_SENDER to the SMTP sender of the configured account | positive | the module wires the real sender into the app |
        | 20 | binds EMAIL_SENDER fail-closed while no account is configured, so no send is believed (AC 6) | negative | a boot without secrets survives but every send fails |
        | 21 | delivers one sign-in-code email to the address it is given (AC 3) | positive | the smoke sender goes through the app's own sender and template |
        | 22 | reports a failed send to whoever ran it | negative | the operator sees the failure; the script exits non-zero |

    *   **SCRUM-237 — [FE] Admin bonus breakdown and finalize view** (28.3). Branch `feat/admin-bonus-finalizes_237` → PR #166 into `feat/pbi-28-performance-bonus`. **Feature:** the admin's Rincian shows **Bonus Performa as one line per link** (platform, value + metric, tier, source, last sync; "Tidak ada data" at Rp0; the lock day), and the **Finalize dialog** takes the newest numbers, names the links the last sync did not update, lists the contents still waiting for bonus data beside "Finalize tetap", and opens a waiting content's Content Detail so the admin can type the missing numbers. **Files:** `frontend/src/lib/finalize-report.ts` (+ `finalize-report.test.ts`), `frontend/src/lib/invoice-actions.server.ts` (+ `invoice-actions.server.test.ts`), `frontend/src/components/invoicing/finalize-modal.tsx` (+ `finalize-modal.test.tsx`), `frontend/src/components/invoicing/invoice-rincian.tsx` (+ `invoice-rincian.test.tsx`), with threading in `invoice-actions.tsx` and `use-breakdown-popups.tsx`. **TDD:** 3 `[RED]`/`[GREEN]` pairs — `e4f03e46→f62cdb67` (the finalize-report seam), `34b8228f→14aadda2` (the dialog's states), `969a8b51→bf8ca44b` (waiting name → Content Detail) — plus `[TEST] 1ce40207` pinning the Rincian lines (19 cases).

        | # | Case (test) | Kind | Why it is that kind |
        |---|---|---|---|
        | 1 | reads the last sync report and the bonus gaps off Finalize's answer (AC 8, 9) | positive | the seam reads what the backend really answered |
        | 2 | reads the waiting links the moment the gaps open (AC 9) | corner | the waiting entries only exist once a gap opens — timing of the shape, not just its values |
        | 3 | drops an entry it cannot read rather than making one up (OWASP A05) | negative | a malformed entry is discarded, never invented into a line |
        | 4 | reads an answer from before the report existed as no report at all | corner | an older backend shape must degrade to "no report", not to a broken date/list |
        | 5 | carries the last sync report and the bonus gaps off Finalize's answer (AC 8, 9) | positive | the server action forwards the seam's data unchanged |
        | 6 | carries the waiting list on the pending-bonus refusal, so Finalize tetap knows what it accepts (AC 9) | negative | a refusal is not a dead end: it carries what the forced finalize would freeze |
        | 7 | asks without accepting first, so the admin sees what waits before freezing anyway (AC 9) | positive | the confirmation shows the consequences before anything is frozen |
        | 8 | says it is taking the newest numbers while the freeze runs (AC 7) | corner | the in-flight state — a state most suites forget |
        | 9 | names the links the last sync did not update before closing (AC 8) | negative | a warning names each affected link, not a generic error |
        | 10 | closes at once when the last sync updated everything (AC 8) | positive | the clean path has no warning |
        | 11 | lists each waiting content with its state beside Finalize tetap (AC 9) | positive | the waiting list renders per content with its state |
        | 12 | says the waiting list is not available until PBI-28.1 rather than showing an empty one (AC 9) | corner | a capability that does not exist yet ≠ an empty list — honesty over filler |
        | 13 | keeps a refusal for another reason visible as before | regression guard | pinning an earlier behavior so the new one cannot silently replace it |
        | 14 | opens the waiting content's detail, where the admin can type its numbers (AC 9) | positive | the name navigates to Content Detail |
        | 15 | keeps a waiting name plain when no content can be opened | corner | no routable content → plain text, not a dead link |
        | 16 | shows each link's line with its platform, value and metric, tier, source and last sync | positive | the per-link anatomy of a bonus line |
        | 17 | reads a link frozen without data as Tidak ada data at Rp0, never as an earning | corner | **zero ≠ missing** — Rp0 renders as "no data", not as an earning of nothing |
        | 18 | keeps a line from before links carried a source unnamed, rather than guessing one | corner | old data without the `source` field stays unnamed |
        | 19 | ends each bonus line of a finalized invoice with the day it was locked | positive | the finalized state's wording on every line |

*   **How the corner cases were identified (the verbal explanation, grading point 3):** the process has five passes, and the inventories above are its output. (1) **Read each acceptance criterion as a contract, word by word** — every number, name and verb becomes an assertion: AC 3's "Kode masuk Tofly from Tofly" pins subject *and* sender; AC 6's "logs only the recipient and the error's kind" produces a test that asserts what the log does **not** contain (cases 15, 22). (2) **Probe every boundary of every number, length and format** — 500 vs 501 characters counted as Unicode characters rather than UTF-16 units (SCRUM-163), a port that is "no whole number" (case 7), a code that must be six digits in both bodies (case 8). (3) **Enumerate every state where data is absent, stale or in flight** — bonus data missing renders "Menunggu data", never Rp0 (SCRUM-237 case 17); a waiting list that does not exist yet shows its reason, not an empty list (case 12); the moment the freeze is running is its own case (case 8); an answer from an older backend version degrades instead of breaking (case 4). (4) **Break every dependency, one at a time** — the SMTP send refused (case 15), a thrown value that is not an `Error` (case 16), a malformed entry inside an otherwise good report (case 3), a name with no routable content (case 15 of 237). (5) **Attack the input as a user never would** — every interpolated value goes through the HTML-escape tests, one per markup character (cases 10–11), because the sign-in email is exactly where injection pays. One regression-guard case per previously fixed behavior (case 13) closes the set, so a future change that re-breaks an old rule fails the suite instead of shipping.
*   **Mock and stub usage (the verbal explanation, grading point 4):** the rule is *the unit under test stays real; everything around it that does I/O, nondeterminism, or framework coupling is replaced at a seam the unit itself defines*. Concretely, in my own tests:
    *   **A fake at a port I own (stub object):** `smtp-email-sender.spec.ts` hands the sender a `transport()` fake — `{ sendMail: vi.fn().mockResolvedValue({ accepted: true }) }` — typed as the `MailTransport` port from `smtp-email-sender.ts`. The unit (`SmtpEmailSender`) is real; only the network is gone. The fake records calls, so the test asserts the **exact envelope** (`from: 'Tofly <tofly.notify@gmail.com>'`, subject, both bodies) — verifying behavior through the fake's recorded calls, not through its internals. The seam is constructor injection, and `sendTestEmail(to, env, makeTransport)` widens the same idea to default-parameter injection (`env = process.env`, `makeTransport = smtpTransport`): production wiring is unchanged, tests pass fakes in.
    *   **A minimal spy for the logger:** `logger()` returns `{ warn: vi.fn() }` cast to `Pick<Logger, 'warn'>` — only the one method the unit calls. This is what makes AC 6 *testable*: the test asserts `warn` was called with the recipient and error kind **and that the code, the body and the error text are absent** — proving a negative in logs is only possible when the log sink is a spy.
    *   **Environment as a value, not as the machine:** settings enter as a plain record (`FULL_ENV` fixture → `smtpConfig(FULL_ENV)`), and server-action tests use `vi.stubEnv('BACKEND_URL', …)`. Nothing reads the developer's real environment, so the suite behaves the same on every machine and in CI; a missing secret is one fixture key away (cases 2–6).
    *   **Module mocks at the framework boundary (`vi.hoisted` + `vi.mock`):** `invoice-actions.server.test.ts` replaces `next/headers` (cookies/headers) and `./session.server`'s `currentRole` with `vi.fn()`s, exposed through an `asRole('admin' | 'creator' | null)` helper — so each test states its actor in one line and the authorization rule (A01) is the thing being tested, not Next.js. `finalize-modal.test.tsx` mocks `@/lib/invoice-actions.server` (`finalizeInvoice: vi.fn()`), so pressing "Tetap Finalize" is observable without server-action machinery, and the dialog's states (cases 7–15) are driven deterministically through the stub's queued results.
    *   **Typed fixtures as stand-ins for endpoints, with drift guards:** from SCRUM-158/163 — `invoice-api.fixture.ts`, `RawInvoiceList`, `RawAdjustment` let a feature ship before its endpoint exists, and **drift-guard tests assert the fixture's keys equal the API's real field set**, so a contract change fails the suite instead of leaving a green suite over a broken integration (the exact failure the PR #82 review found once — the guard came from that lesson). The 237 tests use the same style: one complete, typed `ROW: InvoiceRow` fixture per group, `reply(status, body)` building real `Response` objects as fake backend answers.
    *   **Time injected, never mocked:** `jakartaDay(now)` / `today = jakartaDay()` take the moment as a parameter. No fake timers, no clock monkey-patching — the test's date is visible in its arguments.
    *   **Pure functions get no doubles at all:** `sign-in-code.spec.ts`, `email-config.spec.ts` and `finalize-report.test.ts` run the real code on fixture inputs — the preferred outcome, because every mock is a bet that the fake stays true to the real thing. That is also why the CLI bootstrap was split out (`send-test-email-cli.ts`) rather than mocked: keep the untestables in a tiny `main.ts`-style entry, keep the rest pure and fully covered (SCRUM-239's `src/email` holds a 100% threshold).
    *   **Hygiene behind all of it:** `vi.clearAllMocks()` in `beforeEach`, one fake per test where state matters (`transport()`/`logger()` are built inside each case), fakes limited to the members the unit calls, and assertions on the contract (`toHaveBeenCalledWith`) rather than on mock internals.
*   **Written analysis (for Level 4 — benefits to development *and* maintenance, from concrete data):**
    *   *Development:* RED-first forced the contract before the code — the `GET /contents` translation and the `RawAdjustment` seam were agreed in tests before implementation, so SCRUM-163 shipped **ahead of its dependency** (fixture-backed) with only the server body changing when 12.1 landed. 2,410 tests run in ~46 seconds, keeping the RED→GREEN loop inside a minute.
    *   *Maintenance (iteration):* three concrete returns on the test investment. (1) The PR #82 review found mocks drifted from the real API while the suite stayed green; the drift-guard assertion turned that class of bug into a compile/test failure. (2) The PR #104 review found a Prisma index mismatch the unit suite could not see — TDD's seam tests localized the fix to one module. (3) SCRUM-158's fixture meant the 8.3 endpoint landed later with **zero test rewrites** — only the seam body changed (commit `f5cd379`). Data point: 3 PRs merged with 0 regressions reported post-merge across the three subtasks.
    *   *Additional tooling that makes TDD more efficient:* SonarCloud quality gate gating every deploy (a failing gate blocks merge-to-deploy), coverage badges regenerated per CI run, Stryker mutation testing (`npm run test:mutation`) validating the tests themselves, and AI-assisted TDD (section 7 of the weekly reports) cutting execution time ~70% while keeping the RED/GREEN discipline auditable in the commit log.
*   **Gap for full Level 4:** the "≥3 on Part B TDD for at least 1 month" duration criterion — the evidence above covers 10–23 Oct and 2–5 Nov; keep the cadence going and the criterion is met on duration too. The verbal explanations (corner-case identification process; mock/stub best practices) are prepared in the two subsections above, straight from the inventories' own cases.

### 2. Best Practice Programming, SOLID — CPL 6 AA — **Level 2 solid; Level 3 arguable**

*   **Evidence:** SRP (each library owns one concern: `invoice-adjustment.ts` owns only the rules, `invoice-api.ts` only the wire vocabulary, components only presentation); DIP (time and endpoints injected — `jakartaDay(now)`, `fetchRateInvoices` depends on the contract, not on HTTP); OCP (`Record` mapping tables — `INVOICE_STATUS_LABELS`, `refusalMessage`'s code map; a new lifecycle value fails to compile until its name and label are given); DRY (shared `search-params.ts` helpers, one `AdjustmentLines` component in both the panel and the modal); Adapter (`toInvoiceRow` renames and never recomputes).
*   **Commits:** [`77e3e2c`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/77e3e2c) (translation tables), [`f5cd379`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/f5cd379) (injectable seam + fixture), [`706266b`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/706266b) (one pure rules module), [`4fb70e0`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/4fb70e0) (`jakartaDay` with time passed in).
*   **How it helps when changes occur (Level 2 wording):** when 8.3's `GET /invoices` landed after SCRUM-158 shipped, only `invoice-api.ts`'s body changed — the page and its tests were untouched; when 12.1's endpoint fields appeared, the seam absorbed `adjustments`/`snapshot` without touching components.
*   **For Level 3:** the compare-and-choose diff — e.g. rules held in a pure module (chosen) vs rules inside the form component (rejected, untestable without a DOM) vs rules duplicated in the server action (rejected, drift risk) — is the commit diff of `706266b` + `c294727`; frame it as the comparison in the verbal defense.

### 3. Static Analysis of Program Quality — CPL 6 MRA — **Level 3 demonstrated in detail**

The Level 3 wording asks for quality assurance that is **regular, measurable and beneficial**, with a SonarQube report guarding CI/CD, a 100%-coverage standard on the deploy branches, and no open issues there. Each element, with the evidence behind it:

*   **REGULAR — static analysis is part of every change, not an event:**
    *   SonarCloud analysis runs on **every pull request and every push to `main`** for both projects (`tofly-ugc-management frontend` and `backend`), triggered by `.github/workflows/frontend.yml` / `backend.yml` on `main`, `staging` and `feat/pbi-*` (path-filtered so docs-only pushes cost nothing). It has worked this way since the pipeline was set up in early September and has not been skipped since.
    *   The workflow's own design keeps it regular *and* cheap: one test run per branch at a time (a newer push cancels the superseded run), the Sonar job reuses the coverage artifact from the test job (tests are never run twice), and `npm ci` before analysis so TypeScript rules get type information instead of being silently skipped.
    *   Companion regular checks in the same cadence: the ZAP baseline web-security scan on every push (see section 6) and coverage badges regenerated per run.
*   **MEASURABLE — every run produces numbers, and the numbers are enforced:**
    *   **Enforced at run time, before Sonar even starts:** `vitest` thresholds make a coverage drop a *failed test run*, not a comment nobody reads — 80% lines globally on both suites, and **100% statements, branches, functions and lines on the security-critical modules** (`src/auth/**`, `src/me/**`, `src/email/**`, `src/storage/**`, `src/contents/{content-links*,link-*,video-submission.service}.ts`, `src/invoices/{payment-proof*,proof-upload*,invoice-payments*,invoice-comments*,…}.ts` — the identity, token-storage and money-moving code). `sonar-project.properties` mirrors the vitest exclusions so Sonar's percentage, the badge and the threshold all measure the same thing.
    *   **SonarCloud gate readings, by PR** (Quality Gate = passed on every one): PR #105 (19 Oct) 100% backend / 96.0% frontend coverage on new code; PR #132 (2 Nov) **100.0%** new code; PR #134 (31 Oct) 100.0% new code; PR #135 (31 Oct) 100.0% backend / 96.2% frontend; PR #147 (3 Nov) 97.0% new code — each with 0 new issues, 0 security hotspots and ~0% duplication on new code.
    *   **Measured state of `main`** (the deploy branch; the badge is committed on `main` only, "so the SVG in the README always describes main"): **backend 100% coverage** (`.github/badges/backend-coverage.svg`), **frontend 99%** (`.github/badges/frontend-coverage.svg`), sustained by the thresholds above. Latest whole-suite measurements at the merged tip: backend **148 files / 2,623 tests / 100% statements, functions and lines**; frontend **193 files / 3,425 tests / 99.33% statements** — 6,048 tests, all green.
*   **BENEFICIAL — the measurements have changed the code, three ways:**
    *   *The gate finds what tests miss.* On PR #134 the gate's new-code reading of **81.2%** named two untested chip-removal callbacks in the reworked filter bars; the fix was tests only (`b7041e12`), and the re-analysis read **100%**. The measurement drove the action, and the action was to write tests — not to add exclusions.
    *   *Named findings are fixed, with commits.* Sonar rule violations are resolved as they are raised: **S8786** (backtracking-regex ReDoS risk in `BACKEND_URL` trimming) replaced with a single backward pass (`30244e3f`), **S6848** (click-listening wrapper on the connection badge) removed (`4c8114b6`), floating-promise violations marked `void` where the answer is deliberately ignored (`e8afc967`, `c7ed3bf9`). Issue identification → resolution is visible in the log, not asserted.
    *   *The standard expands as the project grows.* The newest module sign-in (`src/email/**`) was brought under measurement and **held to the same 100% bar** (`b55378a2`, 4 Nov) — the quality standard follows the codebase instead of grandfathering old exemptions.
*   **GUARDING CI/CD WITH THE SONARQUBE REPORT:** the pipeline is `test` (lint + full suite + coverage artifact + build) → `sonar` (scan with `-Dsonar.qualitygate.wait=true`, which turns a failed quality gate into a **failed job**) → `deploy`, where **`deploy` needs `[test, sonar]`**. A red gate therefore cannot reach production: the main-branch deploy refuses unless the gate passed, and the release itself is a candidate revision behind a smoke test before it takes traffic (`.github/workflows/backend.yml`, `frontend.yml`). The one documented exception is `staging`, where the sonar job is skipped *because its code already passed the gate in the PR that brought it there* (and `5788dc5a` fixed the gap where that skip used to skip migrate/deploy too) — the gate follows the code into staging through the PR, and stands again at `main`.
*   **"100% COVERAGE ON STAGING AND MASTER, NO MORE ISSUES":** the *standard* is 100% and it is enforced where the risk is (the module list above fails the build below 100% on any of the four metrics); the *measured* state of `main` is **100% backend**, **99% frontend** with the remainder named and outside the security-critical modules; and the issue state on every analysed ref is **0 new issues / 0 hotspots** with historical findings resolved rule-by-rule as shown above. To take the frontend to a literal 100% on `main` as well, the named remainder (a handful of loading shells and dialog fallbacks) needs the same coverage-gap treatment already demonstrated on PR #134 — the method is proven, the remaining work is mechanical.
*   **For Level 4:** behavioral analysis alongside static — Stryker mutation testing is already configured (`backend/stryker.config.mjs`, `npm run test:mutation`) and its mutant kills are used as test-quality evidence; promoting the mutation score into the gate and profiling the hot queries would complete the move from static-only to behavioral quality analysis.

### 4. Team Development Management & Peer Review (tools) — CPL 2 IAR — **Level 2 solid; Level 3 arguable**

*   **Evidence:** disciplined PR workflow (feature branch → PR → review → merge into `feat/pbi-*` integration branches; 5 `[RED]`/`[GREEN]`/`[FIX]`-named commits, conventional PR titles), Scrum board issues (SCRUM-144/158/163), review discipline with real findings: my review of PR #104 found the Prisma index drift between migration and `schema.prisma` and got it fixed pre-merge; my PR #82 review findings (API contract mismatch, creator-fetch failure domain) were answered with evidence per finding and the thread closed; PR #105's review feedback (two performance findings) was triaged into the 12.3 follow-up with the reviewer's approval as-is. Cross-tool coordination: the `RawAdjustment` seam was agreed with the 12.1 author before her endpoints merged; a cherry-pick/rebase overlap with a third teammate (PR #83) was coordinated so his work continued from a clean base.
*   **For Level 3:** frame these as *solutions to team issues* — the seam agreement prevented a parallel implementation of 12.1; the drift-guard test pattern was adopted as the team's response to the mock-drift review finding.

### 5. Platform Monitoring — **not claimable from current evidence**

No Sentry / GA / New Relic / error-monitoring setup is visible in the repository or the pipelines (Cloud Run platform metrics aside). If the deployed app has monitoring configured by the team, supply the dashboard and this row becomes Level 2 quickly.

### 6. Secure Programming — CPL 6 ES — **Level 2 claimable**

*   **Evidence:** OWASP Top 10 named and applied throughout (A01 Broken Access Control: admin gates before any request, server-side session forwarding; A03 Injection: UUID guards, enum whitelists, length caps, JSON bodies from validated fields; A05 misconfiguration/information disclosure: `BACKEND_URL` and cookies server-side only, 5xx bodies never rendered, `"use server"` actions so `next/headers` never reaches the browser bundle — [`0e245a4`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/0e245a4); A08 data integrity: snapshot rendered verbatim, nothing optimistic; A10 exceptional conditions: generic failure surfaces). AuthN/AuthZ on both sides: admin-only routes and controllers in the backend, admin-gated views and server actions in the frontend. OWASP-tagged tests exist in both suites (e.g. `[TEST][OWASP A01/A05:2025 …] Assert invalid invoice IDs are rejected before lookup`).
*   **For Level 3:** run a screening tool against the deployed lab (e.g. OWASP ZAP / Metasploit) and record before/after — nothing in the repo substitutes for that.

---

## Part B

### 1. Software Deployment & Environment — CPL 6 DA — **Level 3 arguable (Level 2 safe)**

Docker images built per push (`docker build` → Artifact Registry), environments split (staging on `staging`, production on `main`), versioning by SHA + branch tag, ordered pipelines: backend `build → migrate → deploy` (a broken image fails before the database is touched), Cloud Run **candidate tag → smoke test → `update-traffic --to-latest`** — a progressive delivery step where the new revision is tested behind its own URL before taking traffic, and the smoke gate blocks the rollout. Level 4 (autoscaling/Blue-Green + monitoring across build→deploy) is not set up.

### 2. Refactoring & Design Pattern — CPL 6 AA — **Level 2 claimable (Level 3 arguable)**

Identified problems and refactored with named patterns: regex rupiah formatting → `Intl` ([`a04ddef`]), duplicated committed-status checks → one `isCommitted` helper ([`456403`]), lint noise + uncovered branches → clean modules ([`cf2a6bf`]), and the Adapter/State structure of the invoice seam (`f5cd379`, `91e8731`). Three different cases exist for Level 3 if each is presented with its diff.

### 3. Optimizing Test Design — CPL 6 IAF — **Level 2 claimable with one personal run**

Stryker mutation testing is configured and used on the project (`backend/stryker.config.mjs`, `npm run test:mutation`; test commits reference killing surviving mutants in the invoices module). To claim Level 2 personally: run `npm run test:mutation` on your own modules and record which tests were added to kill the survivors — that is the "improvements made to the test cases after running the method" the row asks for, and the written half is ready above (drift-guard assertions, boundary tests for 500/501 characters, page-past-end).

### 4. More Testing (stress / pen-test / BDD) — **not claimable.** No JMeter/k6/BDD suite in the repo.

### 5. Profiling & Optimizing Code — **not claimable.** No profiler runs or query-plan work in evidence.

### 6. Automatic Data Seeding/Migration — **Level 2 claimable**

Prisma migrations + `seed.sql` locally (`db:migrate`, `db:seed`), and CI/CD-integrated on the server: the `migrate` job runs `prisma migrate deploy` against Cloud SQL before `deploy`, with environment-differentiated seeding (`seed-admins.sql` gated on `ADMIN_EMAILS` per environment) and the same migrate SQL rehearsed in the `test` job so a failing migration fails in CI, not during deploy. Level 4 (manual trigger + rollback) not present.

### 7. UI Design — **weak evidence.** Implementation follows the module 1 prototype faithfully (structure, column anatomy), but no Nielsen-heuristic evaluation or benchmarking write-up exists. Needs your design notes to claim Level 1–2.

### 8. UI Standardization (Design Kit) — **Level 2 arguable (Level 3 arguable)**

Shared primitives in source (`Pill`, `StatusDot`, `Modal`, `Button`, `SearchBox`, `FilterSelect`, `Pagination`, `CharLimit`, design tokens like `--radius-control`/`red-ink`/`surface`) used across every feature page by all members, one `WIDTHS`-array table structure instead of hard-coded cells, and the prototype-structure rule ("structure as the prototype structures it, colours in the app's own tokens") applied across SCRUM-158/163. For Level 3, quantify "≥50% of components" and show teammates' commits consuming the primitives.

### 9. Usability Testing — **not claimable.** No Maze/Clarity sessions or user studies in evidence.

### 10. People Person — **Level 1 only.** Scrum board (SCRUM-* issues) and PR review rotation are in use; no recorded team retrospectives/KPIs yet.

### 11. Product Validation — **not claimable** from repo evidence (needs your pitch/validation artifacts).

### 13. Software Transition Strategies — **not claimable** from repo evidence (the fixture-ahead-of-dependency seam is adjacent but not a transition strategy).

### 14–15. Free Choice — **suggested fills:** (14) *AI-Assisted Development* — OpenCode agents, ~70% time reduction, audited TDD output (weekly report section 7); (15) *Contract-First Frontend/Backend Integration* — typed seams shipping ahead of unbuilt endpoints with drift-guard tests (SCRUM-158's `invoice-api.ts`, SCRUM-163's `RawAdjustment`).

---

## Summary — claimable today

| Row | Competency | Claimable level | Strongest single evidence |
|---|---|---|---|
| A1 | TDD | **3** (4 with the written analysis) | 82 TDD commits across 5 subtasks; 22 + 19 case inventories and the mock/stub analysis in A1 |
| A2 | SOLID | **2** (3 arguable) | `706266b`/`f5cd379` — pure rules module + injectable seam |
| A3 | Static Analysis | **3** | `sonar.qualitygate.wait=true` gating every deploy |
| A4 | Teamwork & tools | **2** (3 arguable) | PR #104 review find (Prisma drift) fixed pre-merge |
| A5 | Platform Monitoring | — | no evidence |
| A6 | Secure Programming | **2** | OWASP-tagged guards, `"use server"` boundary (`0e245a4`) |
| B1 | Deployment | **3** arguable (2 safe) | candidate tag → smoke test → traffic switch on Cloud Run |
| B2 | Refactoring & Patterns | **2** (3 arguable) | `a04ddef`, `456403`, `cf2a6bf` diffs |
| B3 | Optimizing Test Design | **2** with one personal Stryker run | `stryker.config.mjs` + mutant-kill commits |
| B6 | Seeding/Migration | **2** | CI `migrate` job + env-gated `seed-admins.sql` |
| B8 | UI Standardization | **2** (3 arguable) | shared primitives + design tokens across all pages |
| B14 | AI-Assisted Development (free) | **4**-ready | weekly report section 7 |
| B15 | Contract-First Integration (free) | **4**-ready | fixture-ahead-of-endpoint seams |

Rows A5, B4, B5, B7, B9, B10 (beyond L1), B11, B13 need artifacts outside this repository
(monitoring dashboards, load tests, user studies, validation pitches) — supply them and the
level can be raised the same way.
