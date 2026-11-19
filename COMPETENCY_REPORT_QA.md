# Competency Report II — Definitions, Evidence, and What to Show

Companion to `COMPETENCY_REPORT.md`. This report holds the verbal-defense material: the
definitions asked at review, and for every point that must be **shown**, the precise place in
my own work where the evidence lives (branch, file, test name, commit) and what to open on
screen. All evidence is my own (git-authorship verified); teammates' commits that share a
branch are not cited. Project: `tofly-ugc-management`, 10 Oct – 5 Nov 2026.

## Index — question → section

| Question at review | Section |
|---|---|
| What is TDD? | 1 |
| TDD at Level 3, sustained for a month | 2 |
| Show three features that were built with TDD | 3 |
| Edge cases: positive / negative / corner, with examples | 4 |
| When to use a stub/mock | 5 |
| Why use a stub/mock | 6 |
| Why dummy data instead of real data (the dependency question) | 7 |
| The FIRST principle | 8 |

---

## 1. What is TDD?

**Definition (say this):** TDD — Test-Driven Development — is a development practice where the
test is written **before** the code, in short Red–Green–Refactor cycles:

*   **Red:** write a small failing test that states the next behavior. It fails because the
    behavior does not exist yet — the failure is the specification.
*   **Green:** write the **minimum** code that makes the test pass. Nothing more.
*   **Refactor:** clean up the code (and the test) while the suite stays green.

The test becomes the first client of the API and its executable specification. The defining
part is the **order**: writing code first and testing it afterwards is not TDD.

**In my work:** every feature below ships as `[RED]`/`[GREEN]` commit pairs — the `[RED]`
commit contains only the failing test, the `[GREEN]` commit the minimum implementation. That
history is 82 TDD-disciplined commits across five subtasks (section 2).

**Show this:** `git log --oneline` on the October work (or the Commits tab of the merged PRs).
Open pair **`2cf470b5 [RED]`** ("Expect GET /invoices to be asked in its own words and read in
the table's" — 16 failing tests) → **`f5cd379e [GREEN]`** ("Translate the invoice list through
one seam, with a fixture standing in for 8.3's endpoint"). The commit order is the proof of the
process — not a claim, an artifact.

---

## 2. TDD at Level 3, sustained for a month

**The claim:** TDD applied continuously from **10 Oct to 5 Nov 2026** (four weeks) — scored
Level 3 at review.

**In my work — the timeline is in the commit dates themselves:**

| When | Subtask | TDD commits |
|---|---|---|
| Oct, weeks 1–2 | SCRUM-144 (Content Plan) + SCRUM-158 (Rate & Invoicing) | 21 `[RED]` / 21 `[GREEN]` / 1 `[REFACTOR]` |
| Oct, week 3 | SCRUM-163 (Adjustment Form & Finalize Modal) | 5 `[RED]`/`[GREEN]` pairs + 2 `[FIX]` |
| Nov 2–5 | SCRUM-237 (Admin bonus breakdown & finalize) | 3 `[RED]`/`[GREEN]` pairs + `[TEST]` |
| Nov 2–5 | SCRUM-239 (SMTP email sender) | 5 `[RED]`/`[GREEN]` pairs + `[TEST]`/`[DOCS]`/`[FIX]`/`[REFACTOR]` |

**Show this:** `git log --format='%ad %s' --date=short --grep='\[RED\]'` — one command shows
Red-first commits with dates spanning the whole month, per subtask. The weekly reports
(`WEEKLY_REPORT-144-158.md`, `WEEKLY_REPORT-163.md`) carry the same dates if a narrative is
wanted.

---

## 3. Three features built with TDD

### Feature 1 — SCRUM-158: Rate & Invoicing table (frontend)

*   **Delivery:** October work, merged — visible on every current branch (the seam's PR is the
    one whose review found the mock drift, later closed with the drift-guard tests).
*   **What it is:** the "Rate & Invoicing" table — every creator's fixed rate, additional and
    penalty amounts, bonus, and total — built against a **typed endpoint seam before the
    backend endpoint existed**: `frontend/src/lib/invoice-api.ts` speaks to `GET /invoices` in
    the API's own words, `invoice-api.fixture.ts` stands in for the endpoint, and
    `toInvoiceRow` translates without recomputing (Adapter). The same page work includes the
    **contract-end period filter** (named periods and custom two-day ranges).
*   **TDD pairs (all mine):** `2cf470b5→f5cd379e` (the seam + fixture standing in for 8.3's
    endpoint — 16 cases), then `5ea8759a→fa784e35`, `24deece8→14943cf8`,
    `f66d6c43→986de4ea` (the contract-end period filter — 21 cases).
*   **Cases worth naming:** *"carries every field of the answer across, so a new one cannot
    arrive unnoticed"* (the drift guard), *"keeps a waiting bonus waiting on the way across"*
    (null stays null — never a zero), *"shows the last page when asked for one past the end,
    never an empty table"*, *"refuses a range put in backwards, naming the two days"*.
*   **Show this:** `frontend/src/lib/invoice-api.test.ts` — open *"carries every field of the
    answer across…"* and the fixture it asserts against.

### Feature 2 — SCRUM-237: Admin bonus breakdown & finalize view (frontend)

*   **Branch:** `feat/admin-bonus-finalizes_237` → PR #166 into `feat/pbi-28-performance-bonus`.
*   **Files:** `frontend/src/lib/finalize-report.ts`, `frontend/src/lib/invoice-actions.server.ts`,
    `frontend/src/components/invoicing/finalize-modal.tsx`,
    `frontend/src/components/invoicing/invoice-rincian.tsx` (+ each one's test file).
*   **TDD:** 3 pairs — `e4f03e46→f62cdb67` (the finalize-report seam), `34b8228f→14aadda2`
    (the dialog's states), `969a8b51→bf8ca44b` (waiting name → Content Detail) — plus
    `[TEST] 1ce40207` pinning the per-link bonus lines in Rincian.
*   **Cases:** 19.
*   **Show this:** `frontend/src/components/invoicing/finalize-modal.test.tsx` — the test
    *"says the waiting list is not available until PBI-28.1 rather than showing an empty one
    (AC 9)"* (a corner case: a capability absent ≠ an empty list).

### Feature 3 — SCRUM-163: Adjustment Form & Finalize Modal (frontend)

*   **Files:** `frontend/src/lib/invoice-adjustment.ts` (pure rules module) and its
    `invoice-adjustment.test.ts`; `frontend/src/lib/invoice-api.ts` + `invoice-api.fixture.ts`
    (the endpoint seam); `jakartaDay` in `frontend/src/lib/format.ts:113`.
*   **TDD:** 5 `[RED]`/`[GREEN]` pairs + 2 `[FIX]`; key commits `706266b` (one pure rules
    module), `77e3e2c` (translation tables), `4fb70e0` (time passed in), `f5cd379`
    (injectable seam + fixture).
*   **Cases:** 16 in `invoice-adjustment.test.ts` alone, plus the form/modal component tests
    and the server-action refusals (`frontend/src/lib/invoice-actions.server.test.ts:96` —
    *"refuses anyone but an admin, without asking (OWASP A01)"*).
*   **Show this:** `frontend/src/lib/invoice-adjustment.test.ts` — the pair of tests
    *"takes a reason of exactly the maximum length"* and *"refuses a reason one character over,
    counting characters and not UTF-16 units"* (the corner pair, section 4).

*Backup features if more are asked:* SCRUM-158 (Rate & Invoicing table — the typed fixture
seam with drift guards) and SCRUM-144 (Content Plan page — the pagination corners,
`frontend/src/app/admin/content-plan/page.test.tsx:117`).

### How to open each feature (demo path)

**SCRUM-158 — Rate & Invoicing table (frontend).** October work, merged — any current branch.
UI path (admin account, running app):

1.  **`/admin/invoicing`** — the "Rate & Invoicing — Tofly" table itself: one row per creator
    with fixed rate, additional, penalty, bonus, and total.
2.  Use the **contract-end period filter** — pick a named period, or a custom range of two days
    (pick it backwards and the table still sorts it) — and flip through the pages: asking for a
    page past the end lands on the **last page**, never an empty table.
3.  Tests only: `cd frontend && npx vitest run src/lib/invoice-api.test.ts` — the seam's cases
    run against the fixture that stands in for `GET /invoices` (no server needed).

**SCRUM-237 — Admin bonus breakdown & finalize view (frontend).** Branch
`feat/admin-bonus-finalizes_237`. UI path (admin account, running app):

1.  **`/admin/invoicing`** — the "Rate & Invoicing — Tofly" table.
2.  Click a row's **"Rincian"** → the *Rincian Invoice* side panel opens.
3.  Inside the panel, the **Bonus Performa** section lists one line per link — platform, value
    + metric, tier, source, last sync; a link with no data reads **"Tidak ada data" at Rp0**.
4.  Press **"Finalize"** → the dialog: the not-updated links (AC 8), the waiting contents
    beside **"Tetap Finalize"** (AC 9), the *"Mengambil angka terbaru…"* state while it runs,
    and a waiting content's **name opens its Content Detail** where the admin types the missing
    numbers. (Until PBI-28.1 fills the gaps, the waiting list shows its marker instead.)
5.  Tests only: `cd frontend && npx vitest run src/components/invoicing/finalize-modal.test.tsx src/lib/finalize-report.test.ts`.

**SCRUM-163 — Adjustment Form & Finalize Modal (frontend).** October work, merged — visible on
any current branch. UI path (admin, running app):

1.  **`/admin/invoicing`** → a row's **"Rincian"** (pick an invoice whose contract has ended to
    see Finalize enabled).
2.  In the panel, the **adjustment form** — *"Nominal (Rp)"* + the reason field (type 501
    characters to watch the 500 cap refuse the 501st).
3.  The **"Finalize"** button freezes the amounts; when it refuses, the button itself says why
    (contract not ended / data still waiting).
4.  Tests only: `cd frontend && npx vitest run src/lib/invoice-adjustment.test.ts src/components/invoicing/adjustment-form.test.tsx`.

---

## 4. Edge cases: positive, negative, and corner

**Definitions (say this):**

*   **Positive case (happy path):** valid input used correctly — the behavior that *should*
    happen. It proves the feature works at all.
*   **Negative case:** invalid input or a refused condition — an empty field, the wrong role, a
    refused call, malformed data. It proves the code **refuses safely** instead of half-working.
*   **Corner case (boundary/extreme):** the extreme ends of the input range — the first and
    last valid values, and the values right next to them. If the input is 1 to 10, the corners
    are **1 and 10**, you also test **2 and 9** (just inside), and to pin the boundary you add
    **0 and 11** (just outside). Corners are where off-by-one bugs live.

**In my work — examples in each class (all mine):**

| Class | Example from my work | Where |
|---|---|---|
| Positive | "sends every filter and the page, in the words the API reads" — the seam speaks the API's language | `frontend/src/lib/invoice-api.test.ts` (SCRUM-158) |
| Positive | "takes a reason of exactly the maximum length" (= 500, the corner's inside value) | `frontend/src/lib/invoice-adjustment.test.ts:75` |
| Negative | "refuses a reason one character over…" (= 501, just outside) — and it counts **Unicode characters, not UTF-16 units**, so one emoji is one character | `frontend/src/lib/invoice-adjustment.test.ts:79` (limit defined at `invoice-adjustment.ts:14`, `REASON_MAX_LENGTH = 500`) |
| Negative | "refuses a range put in backwards, naming the two days" — an invalid custom range is refused, and the refusal names both days | `frontend/src/lib/invoice-api.test.ts` (SCRUM-158) |
| Negative | "refuses anyone but an admin, without asking (OWASP A01)" — refused **before** any request is made | `frontend/src/lib/invoice-actions.server.test.ts:96` |
| Corner | the 1–10 rule applied to a date range: "takes the same day at both ends" (a one-day range) and "reads one open end on its own" (half-open range) | `frontend/src/lib/invoice-api.test.ts` (SCRUM-158) |
| Corner | pagination at the far end, decided deliberately per feature: the invoice table "shows the last page when asked for one past the end, never an empty table", while the Content Plan page "shows the first page with a notice when the asked page is past the end" | `frontend/src/lib/invoice-api.test.ts` (158) / `frontend/src/app/admin/content-plan/page.test.tsx:117` (144) |
| Corner | zero ≠ missing: "reads a link frozen without data as Tidak ada data at Rp0, never as an earning" | SCRUM-237's `[TEST] 1ce40207`, `invoice-rincian.test.tsx` |
| Corner | null stays null: "keeps a waiting bonus waiting on the way across" — a missing bonus survives translation instead of becoming 0 | `frontend/src/lib/invoice-api.test.ts` (SCRUM-158) |
| Corner | "refuses on the last day of the contract" vs "includes a contract that ended early, on the day it ended" — the two ends of the date range around the contract's end | `frontend/src/lib/invoice-adjustment.test.ts:134,138` |

**Show this:** the two case-inventory tables in `COMPETENCY_REPORT.md` (Part A, section 1) —
22 cases for SCRUM-239 and 19 for SCRUM-237, each labelled positive / negative / corner —
or open `invoice-adjustment.test.ts` lines 75–79 and show the 500/501 pair live.

---

## 5. When to use a stub/mock

**Definition (say this):** use a stub or mock the moment the unit under test depends on
something **outside its control**. In practice, six triggers:

1.  **I/O and network** — the backend HTTP API, a database (the server actions' `fetch` behind
    `invoice-actions.server.ts`; the seam that speaks to `GET /invoices`).
2.  **Framework or OS boundaries** — `next/headers` cookies, session lookup (`currentRole`),
    `process.env`.
3.  **Nondeterminism** — the clock (`jakartaDay(now)`), randomness.
4.  **Side effects that must NOT happen in a test** — no real adjustment may be recorded, no
    invoice frozen against the real backend while testing the dialog (the moves are stubbed in
    `finalize-modal.test.tsx`).
5.  **Failure states you must force** — a refused call, a malformed entry, an older answer
    shape, a failure that arrives after another answer already did. A real dependency cannot
    be told to fail on command.
6.  **A dependency that does not exist yet** — a typed fixture lets the feature ship ahead of
    the endpoint: `invoice-api.fixture.ts` stood in for `GET /invoices` before 8.3's endpoint
    existed (SCRUM-158), the shape agreed in tests first.

**Do NOT mock** when the unit is pure. `invoice-adjustment.ts`, `finalize-report.ts` and the
seam's own translation are tested **as themselves** — no doubles at all. If a mock feels
necessary, first ask whether the code can be made pure or given an injectable seam; a mock is
a last resort, not a habit.

**Show this:** `frontend/src/lib/invoice-actions.server.test.ts` (the session and the backend
replaced) side by side with `frontend/src/lib/invoice-adjustment.test.ts` (a pure unit,
nothing replaced).

---

## 6. Why use a stub/mock

**Definition (say this):**

*   **Isolation** — the test verifies *my* logic only. The fake cannot be slow, be down, or
    change its mind between runs; one failing assertion always means one broken rule.
*   **Determinism / repeatability** — the same result on my machine, in CI, and next month.
*   **Reachability** — the forced failure paths of section 5.5 cannot be produced through the
    real thing without breaking other things.
*   **Observability** — some rules are *absences*: "refuses anyone but an admin, **without
    asking** (OWASP A01)" can only be proven by asserting the backend was never *asked* — the
    spy on the session and the fetch records that no call happened
    (`invoice-actions.server.test.ts:96`). The same trick proves a translation never invents a
    value (*"keeps a waiting bonus waiting on the way across"*).
*   **Speed** — no network round trips: 2,410 frontend tests in ~46 seconds, so the RED→GREEN
    loop stays inside a minute.
*   **TDD order** — the test can be written (Red) before the dependency exists; the seam is
    agreed in the test first (SCRUM-158's fixture stood in for `GET /invoices` before the
    endpoint existed; SCRUM-163's `RawAdjustment` seam was agreed with the endpoint's author).

**Show this:** the "without asking" test and the mocked session at the top of
`invoice-actions.server.test.ts` — the whole reason they exist is to prove an absence and to
force a failure.

---

## 7. Why dummy data instead of real data (the dependency question)

**Definition (say this):** the answer under test arrives from a **dependency** — the backend
API, the database, the clock — and that dependency is not mine and not under the test's
control. Real data binds the test to the dependency's *state and availability*:

*   it breaks when the server is down, the row changes, or the contract evolves — so the test
    would be testing the dependency, not my code;
*   it cannot present edge states on demand (bonus data missing, a malformed entry, an answer
    from an older backend version);
*   it can be sensitive or dangerous (real creators, real payment amounts — and a test wired to
    the real backend would record real adjustments and freeze real invoices);
*   it is slow and mutable, so the run is not repeatable.

So the test uses **dummy/fixture data at the seam** — `ROW: InvoiceRow` (a complete invoice),
`reply(status, body)` (a fake backend answer), the typed `RawInvoiceList` fixture (a whole
`GET /invoices` answer) — which pins the contract and exercises my logic deterministically.
The real dependency is verified in **its own layer**: the live DB health check and the CI
deploy smoke test (Cloud Run candidate tag → smoke test → traffic switch). And the dummies are
kept honest by **drift-guard tests** — *"carries every field of the answer across, so a new one
cannot arrive unnoticed"* asserts the translation covers every field of the real API shape, so
a contract change fails the suite instead of leaving a green suite over a broken integration
(the exact failure the PR #82 review found once, and that the guard now turns into a test
failure).

**Show this:** `frontend/src/lib/invoice-api.fixture.ts` (the typed endpoint seam + drift
guard), `frontend/src/components/invoicing/finalize-modal.test.tsx` (the `ROW` fixture), and
`frontend/src/lib/invoice-actions.server.test.ts` (`reply(status, body)` fake answers).

---

## 8. The FIRST principle

**Definition (say this):** FIRST describes what good tests are — **Fast, Independent,
Repeatable, Self-validating, Timely**. My work against each letter:

| Letter | Meaning | Evidence in my work | Show this |
|---|---|---|---|
| **F**ast | tests run in seconds/minutes, not hours — feedback while the context is still in your head | 2,410 frontend tests in ~46 s; the backend suite green per CI run; the RED→GREEN loop inside a minute | `npm run test:cov` in `frontend/` |
| **I**ndependent | each test stands alone — no shared state, no order dependence | fresh fakes per test (`transport()`/`logger()` built inside each case), `vi.clearAllMocks()` in `beforeEach`, environment injected rather than read | run one spec alone: `npx vitest run src/lib/invoice-adjustment.test.ts` |
| **R**epeatable | same result every run, on every machine | no real clock (`jakartaDay(now)`, `frontend/src/lib/format.ts:113`), no network (fixture answers at the seam), no machine env (`vi.stubEnv`, injected `sessionCookies`) | run the same spec twice; it cannot differ |
| **S**elf-validating | every test asserts its own outcome — a human never has to judge the output | every case ends in `expect`; CI enforces it: vitest 100% thresholds on `src/auth|src/me|src/storage|src/email` and `sonar.qualitygate.wait=true` blocking the deploy | the threshold block in `backend/vitest.config.ts` |
| **T**imely | tests are written on time — before the code, with the feature | the `[RED]` commit precedes `[GREEN]` in every pair; the fixture seam shipped *ahead* of the endpoint it stands in for | the commit pairs of section 1 |

**Show this:** `npm run test:cov` (Fast + Self-validating in one screen), one spec run alone
(Independent + Repeatable), and a `[RED]`→`[GREEN]` pair from the log (Timely).

---
