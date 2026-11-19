# PBI-30.2 — Specification Pattern for contract periods that have not started

## Why

PBI-30 lets a creator hold more than one contract period, including one that has not started yet.
PBI-30.2 AC 8.2 says content of such a period must not appear in Task Saya, and the creator cannot
hand in a draft or a link for it until the period starts.

The rule "has this period started?" is needed in three places that work differently:

- **Task Saya** has to filter a list in the database query (it never loads the hidden rows).
- **Draft submit** and **link submit** have to check one content they have already loaded, and answer
  with a clear 409 instead of a 404.

Written inline, the rule would appear three times, each working out "today" on its own. The subtle
part is the day boundary: a period starts at **00:00 WIB** on its start date, which is **17:00 UTC
the day before**. Comparing UTC days opens the period 7 hours late. One object owning the rule means
that boundary is written and tested once.

## The pattern

Specification (Evans & Fowler, "Specifications"; Evans, _Domain-Driven Design_, ch. 9): a business
rule held as its own object, which any candidate can be asked about. Evans names three uses:
validation, selection (querying), and building to order. This feature uses the first two.

| Role                   | Class / function                                | File                                                   |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| Specification          | `Specification<T>` (interface, `isSatisfiedBy`) | `backend/src/specification.ts`                         |
| Concrete specification | `StartedPeriodSpecification`                    | `backend/src/creators/started-period.specification.ts` |
| Client — selection     | `MyContentsService.list` → `narrowing()`        | `backend/src/me/my-contents.service.ts`                |
| Client — validation    | `DraftSubmissionService.submit`                 | `backend/src/contents/draft-submission.service.ts`     |
| Client — validation    | `CreatorLinkActor.assertCanChangeLinks`         | `backend/src/contents/link-change.ts`                  |
| The refusal            | `periodNotStarted()` → 409 `PERIOD_NOT_STARTED` | `backend/src/contents/period-not-started.ts`           |

```ts
export class StartedPeriodSpecification implements Specification<PeriodStart> {
  private readonly cutoff: Date;
  constructor(now: Date) {
    this.cutoff = jakartaMidnight(now); // today in Jakarta, as a Postgres `date` arrives
  }
  isSatisfiedBy(period: PeriodStart): boolean {
    // validation
    return period.start_date.getTime() <= this.cutoff.getTime();
  }
  asWhere(): { start_date: { lte: Date } } {
    // selection
    return { start_date: { lte: this.cutoff } };
  }
}
```

**One rule, two forms.** Both methods use the same `cutoff`, worked out once in the constructor
from the one `now` the caller passes, the same column and the same inclusive bound. Only the `<=`
is written twice, once for JavaScript and once as a Prisma filter for Postgres, because one runs in
Node and the other in the database. The tests prove the two agree:

- a unit test runs a table of start dates through both (`started-period.specification.spec.ts`);
- an e2e test runs `asWhere()` against the real Postgres with periods starting today and tomorrow
  (`test/multi-period.e2e-spec.ts`).

**Kept small on purpose.** No `and` / `or` / `not` composites and no base class: nothing combines
specifications here, and adding them unused would be pattern for show.

### Why not a simpler alternative

| Alternative                                   | Why not                                                                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inline `start_date: { lte: … }` in each place | Three copies of the rule, each computing "today" itself; the WIB boundary has to be right (and tested) three times.                                 |
| A plain helper function                       | Covers either the query or the check, not both from one cutoff; the two forms could drift apart.                                                    |
| A Nest guard                                  | Cannot filter a list (Task Saya would still need the inline version), adds a database read per request, and checks outside the write's transaction. |

### SOLID

- **Single Responsibility:** the services load and write; only the specification knows when a
  period has started.
- **Open/Closed:** a new creator-facing endpoint reuses the specification without changing it.
- **Dependency Inversion:** clients receive `now` (draft submit's parameter, the link change's
  transaction clock) and build the specification from it; none reads the system clock inside the rule.
- **Liskov / Interface Segregation:** `LinkActor` gained `assertCanChangeLinks`; `CreatorLinkActor`
  applies the rule, `AdminLinkActor` is a no-op, so an admin's link changes behave exactly as before.

## What changed

| Where                                               | Change                                                                                                                   | AC           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `me/my-contents.service.ts` `narrowing()`           | The contract scope also holds `start_date <= today (WIB)`, nested under `contracts` so the deadline `OR` cannot widen it | 8.2.1        |
| `contents/draft-submission.service.ts`              | Reads the period's start day; 409 `PERIOD_NOT_STARTED` before it, nothing written                                        | 8.2.2        |
| `contents/link-change.ts`, `link-change.service.ts` | `CreatorLinkActor` refuses on the transaction clock; the read carries `start_date`; admin unchanged                      | 8.2.2        |
| `invoices/invoices.service.ts` `matches()`          | A contract-end range keeps only rows whose own period ends in it                                                         | 2 (invoices) |

Unchanged, pinned by regression tests: Tambah Konten and editing judge a deadline by the content's
own period (AC 8.1.1–8.1.2), and a connected account carries into the new period for sync (AC 6).

## Security (OWASP Top 10 2025)

| ID  | Risk in this code                                                             | Mitigation                                                                              | Evidence                                                                                                              |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A01 | A creator lists or hands in for content of a period not yet theirs to work on | Period scope in Task Saya's query and in both hand-in paths; ownership still 404s first | `my-contents.service.spec.ts`, `draft-submission.service.spec.ts`, `link-change*.spec.ts`, `multi-period.e2e-spec.ts` |
| A06 | The time rule enforced only by the UI, so a direct API call gets round it     | Enforced in the server's write paths                                                    | e2e: direct `POST` draft / video / links answer 409 and save nothing                                                  |
| A10 | Off-by-one at Jakarta midnight; judging on a different clock than the write   | One WIB cutoff; the link check uses the transaction's own `clock.now`                   | Boundary tests at 16:59:59.999Z and 17:00:00Z                                                                         |

A08 and A09 were considered and not claimed: no integrity-of-code/data risk is introduced, and the
repository has no alerting behind log lines.

## Tests

| File                                                | What it pins                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/creators/started-period.specification.spec.ts` | Both methods, the WIB boundary, and that they agree                                  |
| `src/me/my-contents.service.spec.ts`                | Task Saya's query scope, also with a deadline filter, across Jakarta midnight        |
| `src/contents/draft-submission.service.spec.ts`     | 409 before the start and nothing written; accepted from Jakarta midnight             |
| `src/contents/link-change.spec.ts`                  | Creator submit and replace refused before the start; admin unchanged                 |
| `src/contents/link-change.service.spec.ts`          | The read carries `start_date`; a refusal writes and syncs nothing                    |
| `src/invoices/invoices.service.spec.ts`             | Contract-end range per row                                                           |
| `test/multi-period.e2e-spec.ts`                     | Real routes and Postgres: Task Saya, draft, video, links; started period still works |
| `test/multi-period-deadlines.e2e-spec.ts`           | Tambah Konten and edit use the content's own not-started period's window             |
| `test/multi-period-sync.e2e-spec.ts`                | AC 6: sync through the period-1 account; period 1's finalized numbers frozen         |

The e2e files insert the second period directly into `contracts`. That is a **test fixture standing
in for PBI-30.1's endpoint**, not production code.

## Open questions for the PO

- AC 8.1.1 says the latest deadline is "end minus the deadline buffer"; the code uses PBI-38's fixed
  H-5 (`H5_BUFFER_DAYS`). Both are 5 today, so behaviour matches, but they are separate constants.
- AC 10 ("the current period") does not say which period is current in a gap between two periods.
  The existing `currentContract()` shows the most recently ended one, and this subtask keeps it.
