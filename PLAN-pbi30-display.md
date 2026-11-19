# PBI-30 Display Subtask — Step-by-Step Plan

> **Scope**: Creator Detail "Periode" switcher, period-scoped panels, deadline picker,
> Creator Database current period, Pembayaran all-periods invoice list.

---

## Dependency Status (as of 19 Nov 2026)

| Subtask | Status | Evidence |
|---|---|---|
| **30.1 [BE] New period endpoint** | ❌ Not started | No `POST /creators/:id/contracts` anywhere in `backend/src`. Branch `feat/pbi-30-extend-creator-contracts` has zero commits beyond `main`. Contract creation only happens inside `creator-onboarding.service.ts` as a nested `creators.create`. |
| **30.2 [BE] Show the right period everywhere** | ❌ Not started (read-side partially ready) | `currentContract()` and `periodNumber()` in `creator-metrics.ts` already handle multiple contracts. `InvoiceContractDto.period` already numbers periods. But no dedicated branch or PR. |
| **30.3 [FE] "Perpanjang Kontrak" form** | ❌ Not started | No "Perpanjang Kontrak" button anywhere. No `POST /creators/:id/contracts` call in `frontend/src/lib`. "Ubah Data" does not exist. |

**Conclusion**: All three dependencies are unstarted. The display subtask can still make
significant progress because the **read side** (period tabs, multi-period data model, invoice
period numbers) is already in place from PBI-4/SCRUM-139/SCRUM-141. The display subtask
should be designed so that when 30.1 and 30.3 land, the UI automatically reflects new periods.

---

## What Already Exists (no work needed — verify only)

| Requirement | Current state | File(s) |
|---|---|---|
| "Periode" switcher with type, duration, status | ✅ `PeriodTabs` renders `Periode N · Type` + status `Pill` + date window per period | `frontend/src/components/creator-detail/period-tabs.tsx` |
| "Belum Dimulai" periods shown in switcher | ✅ `PERIOD_STATUS_LABELS` maps `"upcoming" → "Belum Dimulai"`; all periods from `contractHistory` are rendered | `frontend/src/lib/creator-detail.ts` L142–155 |
| "Ringkasan" scoped to selected period | ✅ `PeriodSummary` receives `selected` period's data | `period-tabs.tsx` L48–114 |
| "Jadwal Konten" / "Daftar Konten" scoped to period | ✅ `CreatorContentBoard` builds query with `contract: state.contract` | `creator-content-board.tsx` L63 |
| "Tambah Konten" deadline picker buffer validation | ✅ `AddContentModal` computes `firstAllowed` (start+5d) and `lastAllowed` (end−5d H-5) | `add-content-modal.tsx` L143–175 |
| Creator Database shows period number | ✅ Kontrak cell shows `"periode ke-N"` | `creator-table.tsx` |
| Pembayaran lists invoices by period | ✅ "Riwayat Invoice" shows `Periode N` per row; `CreatorInvoice` has `periodNumber` | `invoice-history.tsx`, `creator-invoice.ts` |

---

## What Needs Work

### Step 1 — Fix default period selection (AC 2 of subtask)

**Requirement**: "When Creator Detail opens, the switcher selects the active period. If no
period is active, it selects the next 'Belum Dimulai' period, and if there is none, the most
recent period."

**Current behavior** (`creator-detail-api.ts` L67–73, `openContractId`):
```ts
// Periods arrive oldest first, so the last one is the newest.
return (found ?? raw.contractHistory.at(-1))?.id ?? null;
```
This always picks the **newest** period. It does NOT prefer "active" first.

**Change** — modify `openContractId` to implement the priority chain:

1. If URL `?contract=` names a valid period → use it (existing behavior, keep).
2. Else pick by priority:
   a. The **active** period (`status === "active"`).
   b. The **next upcoming** period (`status === "upcoming"`, earliest `startDate`).
   c. The **most recent** period (last in oldest-first array).

**Files to change**:
- `frontend/src/lib/creator-detail-api.ts` — `openContractId()` function
- `frontend/src/lib/creator-detail-api.test.ts` — add test cases for the priority logic

**TDD approach** (matching the project's RED→GREEN style):
1. **RED**: Write tests asserting:
   - With `[expired, active, upcoming]` → selects `active`
   - With `[expired, upcoming, upcoming]` → selects first `upcoming`
   - With `[expired, expired]` → selects the last (most recent) `expired`
   - With `[upcoming]` → selects `upcoming`
   - URL `?contract=` still overrides
2. **GREEN**: Rewrite `openContractId` to implement the priority.

---

### Step 2 — Ensure "Belum Dimulai" periods show correct info in switcher (AC 1 of subtask)

**Requirement**: "shows each period's contract type, contract duration, and status. 'Belum
Dimulai' periods' switcher is also shown."

**Current state**: Already works — `PeriodTabs` maps over all `periods` (including `"upcoming"`),
renders type label, date window, and status pill.

**Verification task**: Write a test confirming that a `CreatorPeriod` with `status: "upcoming"`
appears as a tab with:
- Label `"Periode 2 · Regular"` (or whatever type)
- Status pill `"Belum Dimulai"`
- Date window text

**Files**:
- `frontend/src/components/creator-detail/period-tabs.test.tsx` — verify existing or add test

---

### Step 3 — Scope "Tambah Konten" / "Ubah Data" / panels to selected period (AC 3 of subtask)

**Requirement**: "'Tambah Konten' and 'Ubah Data' buttons, as well as 'Ringkasan', 'Jadwal
Konten', and 'Daftar Konten' apply to the period selected in the switcher."

**Current state**:
- "Ringkasan" (`PeriodSummary`): receives `selected` period ✅
- "Jadwal Konten" / "Daftar Konten" (`CreatorContentBoard`): queries scoped to `state.contract` ✅
- "Tambah Konten" button: hidden when `period.status === "expired"` ✅; opens `AddContentModal` with `contractId, contractStart, contractEnd` from `selected` period ✅
- "Ubah Data": **does not exist yet** — will be built in 30.3

**Work needed**:
- For "Ubah Data": ensure the button, when built (by 30.3 or another subtask), receives the
  `selected` period's `contractId`, `startDate`, `endDate`, `daysBetween`, `contentQuota`. Since
  this is a display concern, add a placeholder/prop-drilling path or a clear integration point.
- Verify that switching the period tab updates ALL panels (existing `creatorDetailAfterContractChange`
  resets filters/page on tab switch — confirm it also updates the `Tambah Konten` modal's bounds).

**Files**:
- `frontend/src/components/creator-detail/creator-content-board.tsx` — verify contract prop flows to `AddContentModal`
- `frontend/src/components/creator-detail/creator-content-board.test.tsx` — add test: switching period changes the modal's `contractStart`/`contractEnd`

---

### Step 4 — Deadline picker bounds for "Belum Dimulai" periods (AC 4 of subtask)

**Requirement**: "In 'Tambah Konten', the date picker only allows deadlines inside that period,
after the buffer is applied (AC 8.1.1)."

**AC 8.1.1 detail**: "The deadline must fall between the period's start date plus the deadline
buffer and its end date minus the buffer."

**Current state**: `AddContentModal` computes:
```ts
firstAllowed = getBufferWindow({ contractStart, today, bufferDays: 5 }).firstAllowedDate
lastAllowed = latestDeadline(contractEnd) // = end − 5
```
This already enforces the buffer. But `getBufferWindow` uses `max(contractStart, today)` —
for a "Belum Dimulai" period, `today < contractStart`, so `firstAllowed = contractStart + 5`.

**Potential issue**: If the period has not started, `today` is before `contractStart`. The
current `getBufferWindow` handles this correctly (`max(contractStart, today) + bufferDays`).
But the error message says "Deadline paling cepat <date>" — verify it shows the right date
for upcoming periods.

**Work needed**:
- Write a test: opening "Tambah Konten" on a `status: "upcoming"` period with `startDate = "2026-12-01"`
  and `endDate = "2027-03-01"` → date picker `min` = `"2026-12-06"` (start + 5), `max` = `"2027-02-24"` (end − 5).
- Verify the test passes (likely already does).

**Files**:
- `frontend/src/components/contents/add-content-modal.test.tsx` — add test for upcoming period bounds

---

### Step 5 — Creator Database current period display (AC 5 of subtask)

**Requirement**: "Creator Database shows each creator's current period (AC 10)."

**Current state**: `creator-table.tsx` shows `"periode ke-N"` in the Kontrak cell via
`ContractSummary.periodNumber`. Backend `currentContract()` in `creator-metrics.ts` picks
active → most recent expired → earliest upcoming.

**Verification task**: Confirm that `ContractSummary.periodNumber` reflects the "current"
period (not just the latest). Check backend `creator-metrics.ts#periodNumber()`:
```ts
periodNumber() → counts contracts with earlier start_date + 1
```
This is the period's own number (1-indexed), not "which one is current." The table shows
`contract.periodNumber` which is the current contract's number.

**Potential gap**: If a creator has 3 periods and the active one is #2, does the table show
"periode ke-2" or "periode ke-3"? It should show the **current** period's number.

**Work needed**:
- Verify backend `CreatorSummary.contract.periodNumber` is the current contract's number.
- Frontend test: a creator with periods `[expired(1), active(2), upcoming(3)]` shows "periode ke-2".

**Files**:
- `frontend/src/components/creators/creator-table.test.tsx` — add/verify test
- `backend/src/creators/creator-metrics.ts` — read-only verification (no change expected)

---

### Step 6 — Pembayaran lists invoices of every period (AC 6 of subtask)

**Requirement**: "The creator's 'Pembayaran' page lists the invoices of every period (AC 11)."

**Current state**: `CreatorInvoices` component shows:
- "Invoice Periode Ini" — the latest/current contract's invoice
- "Riwayat Invoice" — `invoice-history.tsx` lists all periods' invoices with `Periode N` labels

Backend `GET /me/invoices` returns all invoices. `CreatorInvoice` type has `periodNumber`.

**Verification task**: Confirm that when a creator has 3 periods, "Riwayat Invoice" shows 3 rows
(Periode 1, Periode 2, Periode 3) and "Invoice Periode Ini" shows the active one.

**Potential gap**: "Invoice Periode Ini" is hardcoded to show "Invoice Periode Ini" section.
If the current period is not the latest, does it show the right one? Check `toCreatorInvoices`
in `creator-invoice-api.ts` — line 193: `const [current = null, ...history] = [...invoices].sort(...)`.

**Work needed**:
- Test: creator with 3 periods → "Riwayat Invoice" has 3 rows; "Invoice Periode Ini" shows the
  active period's invoice (not the newest if the newest is "Belum Dimulai").

**Files**:
- `frontend/src/components/creator-invoice/creator-invoices.test.tsx` — add multi-period test
- `frontend/src/lib/creator-invoice.ts` — verify `currentInvoice()` logic (line 193)

---

## Execution Order (TDD)

```
Phase A — Foundation (no dependency on 30.1/30.2/30.3)
  1. RED  → test: default selection picks active > upcoming > most recent
  2. GREEN → rewrite openContractId()
  3. RED  → test: "Belum Dimulai" tab shows type, dates, status
  4. GREEN → verify existing PeriodTabs (likely passes)
  5. RED  → test: Tambah Konten date picker bounds for upcoming period
  6. GREEN → verify existing AddContentModal (likely passes)
  7. RED  → test: Creator Database shows current period number
  8. GREEN → verify existing creator-table (likely passes)
  9. RED  → test: Pembayaran shows all periods' invoices
  10. GREEN → verify existing invoice-history (likely passes)

Phase B — Integration points for 30.3 (when "Ubah Data" is built)
  11. Add prop/type for "Ubah Data" button to receive selected period data
  12. Test: "Ubah Data" button receives selected period's contractId and bounds

Phase C — Integration points for 30.1 (when new period endpoint exists)
  13. Test: after POST /creators/:id/contracts, PeriodTabs shows the new period
  14. Test: default selection updates to the new "Belum Dimulai" period
```

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Backend `openContractId` on server side may override frontend default | Check `creator-detail.server.ts` — the server calls `openContractId` too. Change must be in the pure `creator-detail-api.ts` so both paths get it. |
| 30.1 changes the API response shape | Keep `RawCreatorPeriod` as a `Pick<ContractPeriod, ...>` — any backend field addition is backward-compatible. |
| "Ubah Data" scope creep | This subtask only wires the button to the selected period. The form itself is 30.3's deliverable. |
| Tests must pass at ≥80% coverage | All changes are in existing tested modules. New tests add coverage. |
