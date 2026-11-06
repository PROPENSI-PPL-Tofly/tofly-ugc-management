# SCRUM-236 (PBI-28.2): Last sync at Finalize and the richer snapshot: engineering notes

Branch `feat/last-sync-finalize-snapshot_236`, based on `feat/pbi-27-performance-sync` at `32392de`.

## Design pattern: Adapter

Finalize depends on one port, `LastSync#beforeFinalize(contractId)` (`backend/src/invoices/last-sync.ts`).
27.4 already has the sync, `PerformanceSyncService#syncContract(contractId)`. `PerformanceLastSync`
(`performance-last-sync.adapter.ts`) adapts the sync to the port. It adds the three things Finalize needs and the sync
does not provide:

- a 20-second wait;
- a status (`done`, `failed` or `timed_out`);
- a promise that never rejects.

Neither 27.4 nor the invoice code knows the other's API. The adapter reuses 27.4's `withDeadline`, `DeadlineExceeded`
and `CONTRACT_DEADLINE_MS` instead of adding a second deadline helper.

## Three technical learnings

### 1. `Promise.race` does not cancel the operation that loses

- **Problem found:** Finalize must wait at most 20 s for its last sync. A race between the sync and a timer stops the
  waiting. It does not stop the sync, which keeps running and can still save numbers after Finalize has moved on. A
  rejection that arrives late could also surface as an unhandled rejection.
- **Online research:**
  - MDN's `Promise.race` page says settling the race does not cancel the losing operations. It advises clearing the
    timer when the work wins, and using `AbortController` where the work accepts a signal.
  - The OpenJS Foundation's AbortSignal guide recommends signal-aware timers, which clear themselves.
  - Real cancellation only happens if the signal is passed all the way into the work, for example `fetch(url, { signal })`.
- **Solution applied:**
  - `withDeadline` from 27.4 clears its timer in `finally`. `Promise.race` attaches handlers to the sync, so a late
    rejection is handled and never becomes unhandled.
  - The adapter does not claim to cancel anything. `syncContract` and the platform sources accept no `AbortSignal`, and
    changing 27.4 just to claim cancellation was out of scope.
  - Instead, a late sync cannot change the result. The snapshot is computed only from rows read and share-locked
    inside Finalize's transaction (learning 3). Anything the sync saves later lands on the live rows, never on the
    frozen JSON.
  - 27.4 caps each platform call at the same 20 s, so a late sync still ends on its own.
- **Test evidence:**
  - `performance-last-sync.adapter.spec.ts` (fake timers):
    - at 19,999 ms the sync is still pending, and at exactly 20,000 ms the answer is `timed_out`;
    - a sync answering at 19,999 ms is taken;
    - `vi.getTimerCount() === 0` after both outcomes;
    - a sync that answers or rejects at 25 s keeps the answer `timed_out`, is never retried, and leaves no unhandled
      rejection.
  - `finalize-last-sync.e2e-spec.ts`: changing the live numbers after Finalize, as a late sync would, leaves the stored
    snapshot and the invoice list unchanged.

### 2. Snapshot schema evolution with a Tolerant Reader

- **Problem found:**
  - Finalized invoices already store JSON snapshots without the new `performanceLinks`, and new ones store them.
  - `savedSnapshot` returns `null` for a snapshot it cannot trust, and the invoice is then **recalculated live**.
  - A strict check on the new field would therefore unfreeze a finalized invoice whenever that one optional part is
    malformed. That is the opposite of immutability.
- **Online research:**
  - Martin Fowler's _Tolerant Reader_: read only what you need, ignore what you don't recognise, and be liberal in what
    you accept (Postel's Law).
  - Daigneau's _Service Design Patterns_, which Fowler points to for the full description.
- **Solution applied:** `savedSnapshot` (`invoice-rows.ts`) applies the old strict checks only to the parts every
  snapshot has: the components, the totals and the finalized time. The new optional part is handled leniently:
  - an absent `performanceLinks` (an old snapshot) is read as before;
  - a valid one (`isFrozenLink` checks each field) is kept;
  - a malformed one is **left out**, and the frozen totals still stand. Nothing malformed is ever shown as frozen data
    (OWASP A08).
- **Test evidence:** `invoice-rows.spec.ts` › "the frozen links":
  - old snapshot, synced, manual, never-measured and empty lists all read back;
  - nine malformed shapes (not a list, wrong id type, unknown platform, negative or fractional count, unknown source or
    state, sync time that is not text, element that is not an object) keep the snapshot and drop only the links;
  - existing reader tests still pass unchanged.

### 3. PostgreSQL MVCC: Read Committed vs Repeatable Read for a consistent freeze

- **Problem found:**
  - Finalize must freeze one consistent set of numbers. 27.4's sync writes `content_links` without taking the contract
    lock, and its late writes can arrive while Finalize is mid-transaction (learning 1).
  - "Just use Repeatable Read" sounds safer, but Finalize's first statement waits on the contract lock. Under Repeatable
    Read, the snapshot is taken when that first statement starts, so a manual entry that held the lock and committed
    during the wait would be invisible. The invoice would freeze the stale number.
- **Online research:** the PostgreSQL docs (§13.2, Transaction Isolation) say:
  - Read Committed takes a new snapshot per statement;
  - `SELECT … FOR UPDATE/SHARE` returns the **updated** version of a row it waited for;
  - Repeatable Read sees a snapshot "as of the start of the first non-transaction-control statement".
- **Solution applied:**
  - Finalize stays in **Read Committed**. It locks the contract row, then reads the delivered links **with
    `FOR SHARE OF l` in one statement** (`lockDeliveredLinks`).
  - That one statement waits for any in-flight write and returns the committed version.
  - The share lock keeps every later sync or manual write off those rows until Finalize commits, so the snapshot is one
    consistent set of numbers.
  - The remote sync itself runs **before** the transaction and holds no lock (OWASP A06).
- **Test evidence:** `finalize-last-sync.e2e-spec.ts` (real PostgreSQL, deterministic through `pg_stat_activity`
  lock waits):
  - an uncommitted write to a link makes Finalize wait on `FOR SHARE OF l`, and Finalize then freezes the committed
    12,400;
  - a side-by-side test: a reader blocked on the contract lock while a writer commits 12,400 reads 12,400 under
    `ReadCommitted` and the stale 9,000 under `RepeatableRead`;
  - `FOR UPDATE NOWAIT` on the contract succeeds while the platform is still answering, which shows no lock is held
    during the sync.

## OWASP Top 10:2025 safeguards

| Category                                   | Safeguard                                                                                                                                                                             | Test                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A01 Broken Access Control                  | The "not updated" report names only this contract's delivered links. Entries the sync returns that are not among them are never echoed.                                               | `invoice-command.service.spec.ts`                                        |
| A06 Insecure Design                        | The sync runs before the transaction, never under the contract lock, and the wait is capped at exactly 20 s.                                                                          | adapter spec (timer boundary), command spec (call order), e2e (`NOWAIT`) |
| A08 Software or Data Integrity Failures    | A share-locked, consistent read freezes the links, a later live change never alters the snapshot, and the Tolerant Reader drops untrusted frozen data without unfreezing the invoice. | frozen-links spec, rows spec, e2e                                        |
| A09 Security Logging and Alerting Failures | One warning per failed or timed-out sync, naming the contract and the error's kind, never its text, which could hold tokens or platform answers.                                      | adapter spec                                                             |
| A10 Mishandling of Exceptional Conditions  | A rejected or timed-out sync becomes a status and never fails Finalize, and late answers or rejections are absorbed.                                                                  | adapter spec, command spec                                               |

Also A05 Injection: the contract id is bound in the links query, never spliced into the SQL.

## Integration dependencies: connected (fix/pbi-28-integration, 4 Nov)

PBI-28.1 (#165) landed with per-link bonus lines; a link without its configured metric is a line with
`basis.status = 'waiting'`, carrying its `state` (link `data_state`). The two SCRUM-236 parts that waited on it
are now done:

1. **AC 9:** `bonusDataGaps(performanceBonus)` in `bonus-data-gaps.ts` reads the waiting lines of the bonus that
   Finalize calculates on the locked contract and answers `{ available: true, waiting, noDataLines }`. The
   `INVOICE_BONUS_PENDING` 422 and Finalize's success answer both carry it; it is never written into the snapshot.
2. **Rp0 no_data lines:** when `acceptPendingBonus` is true, `settleForFinalize` turns each waiting line into its
   `frozenWithoutData` line (Rp0, `status: 'no_data'`, state and trace kept). Totals don't change, and the
   snapshot keeps one line per link frozen without data, for PBI-32 to correct later.

The `available: false` / `PBI_28_1_PENDING` marker and `noDataLine(link, metric)` are gone. `available: true`
stays in the answer so a reader that checks it still reads the list.

Other notes:

- The 422 for a pending bonus does not yet carry `lastSync`. It can be added together with the waiting list.
- Finalize's response gains `lastSync` and `bonusDataGaps`. The 28.3 frontend (#166) reads both in the Finalize
  dialog.
