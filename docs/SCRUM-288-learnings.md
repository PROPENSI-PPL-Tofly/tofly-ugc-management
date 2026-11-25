# SCRUM-288 learnings: 37.3 [FE] Early end display (PBI-37)

Branch `feat/early-end-display_288`, cut from `feat/pbi-37-end-contract-early`.

## What this subtask is

PBI-37 lets an Admin end a creator's contract before its original end date. The backend (37.1, branch
`feat/end-contract-early-endpoint_286`) does the real work: it moves the contract's `end_date` to the
new last day, keeps the original end, stores the reason and note, may cancel the invoice, and closes
access. My job was only to **show** the result correctly:

| Where | Who sees it | What it shows now |
|---|---|---|
| Creator Database | Admin | "Berakhir Lebih Awal", "Berakhir lebih awal pada [tanggal], semula [tanggal].", "Alasan: …" |
| Creator Detail (period tab) | Admin | The same three lines, from the same component |
| Rate & Invoicing | Admin | A **Cancelled** badge and a **Cancelled** filter option |
| Pembayaran | Creator | **Dibatalkan** (never "Cancelled"), no move offered, the tracker waits on no step |
| Dashboard | Creator | "Hari terakhir kontrak: [tanggal]", and a 403 `PAYMENTS_ONLY` sends them to Pembayaran |
| Sign-in | Everyone | PBI-23's "Akun ini tidak punya akses ke Tofly. Hubungi tim Tofly kalau ada pertanyaan." |

The backend branch is not merged yet, so every frontend test mocks the API in the exact shape the
286 DTOs define (`ContractSummary.earlyEnd`, `ContractPeriod.earlyEnd`, the `'cancelled'` status,
`403 { code: 'PAYMENTS_ONLY' }`, `?error=not_authorized`, `403 { code: 'ACCESS_DENIED' }`). I added no
new field names.

## How the Admin and Creator views differ

- **Admin.** `readEarlyEnd` (`frontend/src/lib/early-end-display.ts`) turns the API's `earlyEnd` object into
  `{ originalEndDate, reason }`. `EarlyEndNote` (`frontend/src/components/creators/early-end-note.tsx`)
  draws it. Creator Database (`creator-table.tsx`, `ContractEarlyEnd`) and Creator Detail
  (`period-tabs.tsx`) both use that one component, so they can't drift apart.
  `early-end-consistency.test.tsx` renders both pages from the same contract and checks that the lines match.
- **Creator.** The creator API (`/me/invoices`) never sends the reason, the note or the original end.
  The creator side only reads `contract.endDate` (now the last day) and the invoice status. The creator's own
  word for Cancelled comes from `CREATOR_INVOICE_STATUS_LABELS` (`frontend/src/lib/creator-invoice.ts`).

The assignment said a design pattern wasn't needed for this subtask. I reused what was already there
instead: the label maps (`INVOICE_STATUS_LABELS`, `EARLY_END_REASON_LABELS`), the `Pill` component with its
existing tones (`red` for Cancelled, `redSoft` for Berakhir Lebih Awal), `formatDate`, and the existing
parsers. Adding `cancelled` to `INVOICE_STATUS_LABELS` was enough to make the filter options, the URL
allow-list and the API query all know it. I didn't write a second filter.

### Dates

The API sends calendar days as `YYYY-MM-DD`. `formatDate` reads them as UTC, so "2026-11-01" stays
"1 Nov 2026" and never becomes 31 Oct. One test pins that (`early-end-display.test.ts`, "never moves a
day across midnight"). The original end and the last day stay two separate values all the way to the screen.

## OWASP Top 10:2025 evidence

| Category | What I did | Code | Tests |
|---|---|---|---|
| **A01 Broken Access Control** | The creator side never renders a reason, note or "ended early". The real boundary is the backend, which doesn't send those to creators; the frontend copies fields one by one, so even a leaky answer can't reach the screen. The Dashboard **follows** the backend's `PAYMENTS_ONLY` to Pembayaran instead of working around it. | `lib/creator-invoice-api.ts` (`toCreatorInvoice`), `lib/creator-dashboard.ts` (`contractLastDay`), `app/creator/dashboard/page.tsx` (`redirect`) | `creator-invoice-api.test.ts` "drops the reason and the note…", `app/creator/dashboard/page.test.tsx` "never shows an early-end label, a reason or a note…", "is sent to Pembayaran…", "is not redirected for another refusal…" |
| **A05 Injection** | Everything is plain JSX text; no `dangerouslySetInnerHTML`. A reason that isn't one of the three known values is never printed. | `components/creators/early-end-note.tsx`, `lib/early-end-display.ts` | `creator-table.test.tsx` "never renders markup that arrives in the early end" (an `<img onerror>` reason renders no element and no text) |
| **A06 Insecure Design** | "Ended early" comes only from the API's `earlyEnd`, never from dates. Cancelled is its own terminal state: no move, no "current" step, not a pipeline step with a date. | `lib/early-end-display.ts`, `lib/creator-detail-api.ts`, `lib/creator-invoice.ts` (`invoiceSteps`, `NEXT_STEPS`), `lib/invoice.ts` | `creator-table.test.tsx` "says nothing of an early end for a contract running / ended as agreed / …", `period-tabs.test.tsx` "says nothing … on periods that ran as agreed", `creator-invoice.test.ts` "waits on no step of the pipeline" |
| **A07 Authentication Failures** | `not_authorized` (Google) and `ACCESS_DENIED` (email code) both show PBI-23's one message, so the page never reveals whether an email is registered. Wrong, expired or short codes, cancelled Google sign-in, expired sessions and network failures keep their own messages. | `lib/login-errors.ts` (`ACCESS_CLOSED`), `components/auth/email-code-sign-in.tsx` | `login-errors.test.ts`, `app/login/page.test.tsx` "says the account has no access in PBI-23's words…", "never says the account has no access after …", `email-code-sign-in.test.tsx` "never says … has no access", `email-sign-in-api.test.ts` "a 403 without ACCESS_DENIED" (already there) |
| **A10 Mishandling of Exceptional Conditions** | A broken `earlyEnd` costs the row its early-end lines, not the page. A cancelled invoice no longer makes the creator's whole Pembayaran page fail (before this, the parser rejected the answer). If `/me/invoices` fails, the Dashboard only loses its last-day line. A refusal keeps the backend's code but never its message. | `lib/early-end-display.ts` (`readEarlyEnd`, `isPlainDay`), `app/creator/dashboard/page.tsx` (`loadLastDay`), `lib/my-tasks.server.ts` (`refusalCode`), `lib/my-tasks.ts` | `early-end-display.test.ts` "reads an early end with … as none", `creator-table.test.tsx` "still lists a creator whose early end arrived broken", `creator-invoice-api.test.ts` "accepts an invoice an early end cancelled", `page.test.tsx` "still shows the cards after …", `my-tasks.test.ts` "carries the backend's refusal code, and not its words" |

## RED → GREEN → REFACTOR

Each behaviour got its own failing test, committed first, then the smallest change to pass it:

| # | RED | GREEN | What it covers |
|---|---|---|---|
| 1 | `a48f8f17` | `78f25888` | Cancelled badge and filter on Rate & Invoicing |
| 2 | `26bdb5ac` | `d8e53d0e` | Creator sees Dibatalkan, no move, no reason or note |
| 3 | `bca99feb` | `e9828452` | Creator Database early-end lines |
| 4 | `4eacc019` | `c0f0092f` | Creator Detail shows the same lines |
| 5a | `0bf2ca76` | `2616318a` | Dashboard last day from `/me/invoices` |
| 5b | `f6948656` | `a88ad54f` | Dashboard follows `PAYMENTS_ONLY` |
| 6 | `1a35d32e` | `22d2a8a6` | PBI-23 sign-in message |
| R | | `20d3a350` | REFACTOR: one calendar-day check (`isPlainDay` in `format.ts`) instead of a third regex copy |

A few RED commits also hold guard tests that already passed. For example, the creator parser was already
copying fields one by one. I kept them as regression guards and said so in the commit bodies.

## Decisions I made and why

- **The same message for closed and unregistered accounts.** The backend uses one code for both on purpose
  (PBI-23, anti-enumeration), and the team agreed not to tell them apart in the frontend.
- **The Admin note isn't shown.** The AC asks for the label, both dates and the reason. `readEarlyEnd` keeps only those.
- **The creator Dashboard shows the last day for every contract.** The creator API doesn't say whether a
  contract ended early (correctly, for A01), so the line reads the same for every contract.
- **`earlyEnd` is optional on `CreatorPeriod`.** Absent means "not ended early". This kept the eleven
  existing test fixtures unchanged.
- **No date for the Cancelled step.** The API sends no `cancelledAt`, so Cancelled isn't a dated
  step in the creator's tracker.

## Test and coverage results

Ran in `frontend/`, in the `../tofly-ugc-management-288` worktree:

- `npx vitest run`: **4496 passed, 0 failed** (baseline before the branch: 4416).
- `npx tsc --noEmit -p .`: only the three `LayoutProps` errors that are already on the base branch (Next's
  generated types are missing before a build). No new errors.
- `npx vitest run --coverage`: every file this branch adds or changes:

| File | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| app/creator/dashboard/page.tsx | 100 | 100 | 100 | 100 |
| components/auth/email-code-sign-in.tsx | 100 | 100 | 100 | 100 |
| components/creator-detail/period-tabs.tsx | 100 | 100 | 100 | 100 |
| components/creator-invoice/invoice-history.tsx | 100 | 100 | 100 | 100 |
| components/creators/creator-table.tsx | 100 | 100 | 100 | 100 |
| components/creators/early-end-note.tsx | 100 | 100 | 100 | 100 |
| components/invoice/invoice-table.tsx | 96.87 | 97.91 | 100 | 100 |
| lib/creator-dashboard.ts | 100 | 100 | 100 | 100 |
| lib/creator-detail-api.ts | 100 | 100 | 100 | 100 |
| lib/creator-detail.ts | 96.15 | 95.45 | 100 | 100 |
| lib/creator-invoice.ts | 100 | 100 | 100 | 100 |
| lib/creators.ts | 100 | 100 | 100 | 100 |
| lib/early-end-display.ts | 100 | 100 | 100 | 100 |
| lib/format.ts | 100 | 100 | 100 | 100 |
| lib/invoice.ts | 97.61 | 97.36 | 100 | 100 |
| lib/login-errors.ts | 100 | 100 | 100 | 100 |
| lib/my-tasks.server.ts | 100 | 100 | 100 | 100 |
| lib/my-tasks.ts | 100 | 100 | 100 | 100 |

The three files under 100% are short of it only on lines this branch didn't touch:
`invoice-table.tsx:270`, `creator-detail.ts:132, 328, 331` and `invoice.ts:202`. Those gaps were already
there. Every line this branch added or changed is covered. I didn't change any coverage exclusion or threshold.

## Still open (needs the backend merged)

- Checking against the real backend, after `feat/end-contract-early-endpoint_286` is merged into the integration branch.
- A creator whose access closes **during** a session gets a 401 and sees "Sesi Anda sudah berakhir", not the
  PBI-23 message. The backend doesn't send a separate code for that case.
- Task Saya and the other creator pages also get `PAYMENTS_ONLY` from the backend. This subtask handled only the Dashboard.
