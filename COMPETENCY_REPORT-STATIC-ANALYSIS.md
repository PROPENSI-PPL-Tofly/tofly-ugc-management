# Competency Report — Static Analysis and Quality Assurance (CPL 6 MRA)

Target rubric, all three columns:

> **L1** — Knows and understands the relationship between static analysis and quality assurance,
> and has followed the standard pattern for applying it.
> **L2** — Can explain examples and the application of QA in the development process, from issue
> identification to issue resolution, by showing the related commit.
> **L3** — Can show the application of quality assurance that is regular, measurable, and
> beneficial to the project. For example, guarding CI/CD with a SonarQube report, standard 100%
> code coverage on the staging and master branches, with no more issues on those branches.

This report is organized around **SonarQube (hosted as SonarCloud) as the project's core QA
instrument**: §2 is the usage-and-benefits centerpiece — what the tool does in the pipeline,
feature by feature, and what the project concretely gains from it; §1 is the QA relationship,
§3 the standard application pattern, §4 the eight issue→resolution cycles, §5 the L3 evidence,
§6 the rubric map.

---

## 1. The relationship between static analysis and quality assurance

**Quality assurance is the whole system** by which a project defines what "good" means, prevents
defects, detects what slips through, measures where it stands, and improves. **Static analysis
is one instrument inside that system** — the one that inspects source code *without executing
it*, automatically, on every change. The relationship has four parts:

1. **Static analysis makes the quality model executable.** A QA standard ("no unhandled promise
   rejections", "no regexes with catastrophic backtracking", "no click-jacking wrappers") is
   prose until a rule engine checks it on every commit. In this project the quality model is
   literally machine-checkable: SonarCloud's rules (S8786, S6848, the floating-promise rule),
   coverage thresholds, and the lint/type gates are the standard, enforced — not suggested.
2. **Static analysis is the leftmost detection layer.** QA cost-curve logic says a defect found
   at analysis time costs a fraction of one found in test, UAT or production — and this project
   has lived both ends: the iteration-2 UAT round produced expensive late tickets, while a Sonar
   finding fixed in a `[REFACTOR]` commit costs one small diff. The tool moves detection toward
   the moment the defect is created.
3. **Static analysis is measurement, and QA needs measurement.** It produces the numbers quality
   management runs on — coverage on new code, issue counts, duplication, maintainability ratings
   — trends that make "is the product getting better?" answerable instead of arguable.
4. **Static analysis alone is *not* QA — it is one layer of the model.** It cannot prove
   correctness, and its output needs triage (rule severity, false positives). This project pairs
   it deliberately with the other QA layers, each covering the others' blind spots:

| QA layer | What it judges | What it cannot see | In this project |
|---|---|---|---|
| Static analysis | Code patterns against rules | Runtime behaviour, requirements | SonarCloud + lint + `tsc` |
| Test coverage | Which code the tests exercise | Whether the assertions are strong | vitest/v8 coverage + thresholds |
| Test correctness | Behaviour against expectations | Systemic gaps tests don't think of | 6,048 tests, TDD RED→GREEN |
| Mutation testing | Whether the *tests* can kill mutants | Production behaviour | Stryker (`npm run test:mutation`) |
| Dynamic scanning | What the running app actually sends | Source-level design issues | OWASP ZAP baseline (per push) |
| Peer review | Intent, design, correctness | Mechanical pattern compliance | PR review on every change |

Static analysis is the layer that runs **every time, on everything, in seconds** — the cadence
the other layers piggyback on. That is why the standard pattern places it in CI rather than in a
periodic audit.

## 2. SonarCloud in practice — what the tool does for this application, and what it gains

SonarCloud is this project's SonarQube (hosted). In one sentence: on **every pull request and
every push to `main`** it reads both codebases against its rule set, measures how much of the
code the tests exercise, and either **approves or blocks the deploy** against a Quality Gate
written down in advance — keeping a permanent record of every finding and the commit that
closed it.

### 2.1 Where it sits in the pipeline (usage)

```
push / PR ──► test  (lint + vitest + coverage lcov artifact + build)
                  │
                  ▼
            sonar — "SonarCloud analysis"            ← SonarQube lives here
              • reuses the test job's lcov artifact (tests never run twice)
              • npm ci first — type-aware rules (S9383) need type information
              • -Dsonar.qualitygate.wait=true → a failed gate is a failed job
                  │
                  ▼
            build / migrate / deploy    needs: [test, sonar]   ← rejected gate = no ship
```

Two analyses are configured — `sonar-project.properties` in each package declares what is
source versus test (colocated `*.spec.ts` / `*.test.ts(x)` are analysed as tests, not code),
where the coverage report lives (`coverage/lcov.info`, produced by vitest), and which
`tsconfig.json` the TypeScript analyzer needs. The coverage exclusions mirror vitest's own
"so Sonar's percentage matches the badge and the 80% threshold" — one measured truth, not two.

### 2.2 Feature by feature — how this project uses SonarQube

| SonarQube capability | How this project uses it |
|---|---|
| **Rule analysis** (bugs, vulnerabilities, code smells) | The rule set finds defect *classes* in this app's own code: **S8786** (catastrophic-backtracking regex in `BACKEND_URL` trimming — a ReDoS risk), **S9383** (floating promises, twice), **S6848** (click-listening wrapper), **S2699** (three assertion-less e2e test cases — the tool auditing the tests themselves). All fixed with named commits — §4 |
| **PR analysis & the New Code period** | Every PR gets its own reading of *issues on new code* and *coverage on new code*. History is not held hostage; **new code must meet the bar before it merges** — the "Clean as You Code" posture |
| **Coverage measurement** | Imports vitest's lcov per run; the same numbers drive the badges, the per-PR readings and the per-module 100% bars — the tool measures, the suite enforces |
| **Quality Gate** | Conditions on the new code agreed in advance; `-Dsonar.qualitygate.wait=true` turns a failed gate into a **failed CI job** — the standard is enforced by machine, not by memory |
| **Deploy gating** | `build`/`migrate`/`deploy` **need `[test, sonar]`** — a rejected gate physically cannot reach production. This is the rubric's "guarding CI/CD with a SonarQube report" |
| **PR decoration & issue lifecycle** | Every PR carries the SonarCloud verdict comment; every issue is raised → resolved *"fixed in commit X"*. Closed issues are kept — the permanent record behind §4's table |
| **Badges & dashboards** | Coverage badges committed **on `main` only** ("so the SVG in the README always describes main"): backend 100%, frontend 99% |

### 2.3 What the project gains from using it (benefits)

1. **Defect classes are caught at creation time, not in UAT.** The S8786 ReDoS regex would
   otherwise have surfaced as a late security ticket; instead it cost one small `[REFACTOR]`
   diff (`30244e3f`). The floating promises would have surfaced as silent, unreproducible
   production errors; instead they cost one `void` each (`e8afc967`, `c7ed3bf9`).
2. **A machine-enforced merge bar finds what tests miss.** PR #134's own developer wrote the
   feature and its primary tests — the gate's per-PR reading still named two untested
   chip-removal callbacks. The response was 77 lines of tests (`b7041e12`), not a lowered
   threshold (§4b). Row 8 shows the same instrument auditing the *tests* themselves: three
   e2e cases whose bodies asserted nothing the rule could see — a test that cannot fail.
3. **The cost of quality moves left.** This project has lived both ends of the cost curve:
   iteration-2 UAT produced expensive late tickets; every §4 finding cost a small diff on the
   day it was created. Detection moved to the moment the defect enters the code.
4. **"Is quality improving?" becomes answerable.** Per-PR gate readings and branch trends turn
   quality into numbers (§5's table) instead of opinions — regular, measurable, repeatable.
5. **The standard propagates by itself.** Row 1 was found and fixed by me; two weeks later a
   teammate applied the same `void` pattern unprompted (row 4), and `src/email` was enrolled
   at the full 100% bar (row 6). The tool is what makes a team convention enforceable.
6. **Every claim carries its receipts.** Issue → resolution → commit → re-analysis, in links
   a reviewer can click — the evidence L2 asks for is a by-product of normal development.

### 2.4 What it does not do — the boundary, managed deliberately

*   **It never runs the application.** `jakartaDay` was 89.6% of a workload's CPU and *correct*
    by every rule — only profiling saw it (the profiling report, §1's layer table). SonarQube
    is the leftmost layer of the model, not the whole model.
*   **It does not run the tests** — it consumes the coverage artifact. vitest does the running,
    and vitest's thresholds fail the run *before* Sonar even starts: two independent gates on
    one standard.
*   **Enforcement lives where it is reliable.** The floating-promise rule (S9383) is enforced
    by SonarCloud alone: the `sonar` job installs dependencies first so the TypeScript analyzer
    gets type information (rules that need it are silently skipped without it). The local
    oxlint mirror carries the rule's name but cannot enforce it — knowing which instrument
    actually enforces which standard is part of using the tool well.
*   **It does not fix anything.** Every finding in §4 has a named human and a commit; the tool
    raises, the team resolves.

## 3. How this project has followed the standard pattern

The standard application pattern is a six-step loop — *define → integrate → gate → measure → fix
→ evolve* — and the project follows each step with a concrete mechanism:

| Step | Standard practice | This project's implementation |
|---|---|---|
| **Define** | A written quality profile and quality gate | SonarCloud Quality Gate on both projects (`tofly-ugc-management frontend` / `backend`); vitest thresholds — 80% lines globally and **100% on all four metrics** for security-critical modules (`src/auth/**`, `src/me/**`, `src/email/**`, `src/storage/**`, the link/payment/comment/invoice-lifecycle files); `sonar-project.properties` mirrors the vitest exclusions "so Sonar's percentage matches the badge and the 80% threshold" — one measured truth |
| **Integrate** | Analysis runs in CI on every change, reusing CI's artifacts | The `sonar` job in `frontend.yml` / `backend.yml` runs on **every PR and every push to `main`** (also `staging` / `feat/pbi-*` pushes for tests), consuming the lcov artifact from the `test` job so tests never run twice, and running `npm ci` first so TypeScript rules get type information instead of silently skipping |
| **Gate** | Quality failures block integration/deployment | `-Dsonar.qualitygate.wait=true` turns a failed gate into a **failed job**; `deploy` **needs `[test, sonar]`** and the production deploy requires a passed gate; the vitest thresholds fail the *run itself* before Sonar even starts — two independent gates on the same standard |
| **Measure** | Dashboards, badges, per-change numbers | Per-PR "Coverage on New Code" readings; coverage badges committed **on `main` only** ("so the SVG in the README always describes main"): backend **100%**, frontend **99%**; local full-suite measurements per merged tip |
| **Fix** | Findings resolved at the pace they arrive, with evidence | The issue → resolution commits in §4; the standing discipline that gaps are closed **with tests or refactors, never with exclusions** |
| **Evolve** | The standard follows the codebase | New modules are enrolled at the full bar, not grandfathered (`b55378a2` brings `src/email` under measurement at 100%); pipeline gaps themselves are fixed (`5788dc5a`); exclusions shrink rather than grow |

This is the textbook SonarQube "Clean as you Code" posture (new code held at the gate, history
improved deliberately) combined with shift-left enforcement (thresholds fail the local run), and
it has been in place continuously since the pipeline was set up in early September.

## 4. Examples of usage — issue identification → resolution, with the related commit

Each row is a full QA cycle: something wrong or unmeasured, identified by analysis, fixed in a
named commit, verified by re-analysis. Authorship is marked — rows 1, 2 and 8 are my own
(row 8 found on the live project on 19 Nov), the rest are the team applying the same pattern
on the same pipeline.

| # | Finding (how identified) | PR | Author | Resolution commit | Verification |
|---|---|---|---|---|---|
| 1 | **Floating promise** — the revise command's deliberately ignored answer was an unhandled promise (Sonar's promise rule, PR analysis) | [#74](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/74) | **me** | [`e8afc967`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/e8afc967) `[GREEN] Mark the revise command's ignored answer with void so Sonar's floating-promise rule passes` (9 Oct) | Rule clean on re-analysis; pattern reused by the team afterwards |
| 2 | **Coverage gap named by the Quality Gate** — PR #134's new-code reading of **81.2%** pointed at two untested chip-removal callbacks in the reworked filter bars | [#134](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/134) | **me** | [`b7041e12`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/b7041e12) `test(frontend): cover the bars' chip-removal wiring and the chip row without a reset` (31 Oct) | Re-analysis reads **100.0% Coverage on New Code**, Quality Gate passed — closed with tests only |
| 3 | **S8786 — regex with catastrophic backtracking** risk in `BACKEND_URL` trailing-slash trimming (Sonar PR analysis) | [#101](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/101) | kingfrog711 | [`30244e3f`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/30244e3f) `[REFACTOR] Trim BACKEND_URL's trailing slashes in one backward pass instead of a backtracking regex (Sonar S8786)` (16 Oct) | Rule gone; behaviour pinned by existing tests |
| 4 | **Floating promise** — the comment thread's load chain (Sonar's promise rule) | [#111](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/111) | maharanianindya | [`c7ed3bf9`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/c7ed3bf9) `[REFACTOR] Mark the comment thread's load chain as handled with void, as Sonar's promise rule asks` (19 Oct) | Rule clean |
| 5 | **S6848 — click-listening wrapper** around the connection badge (Sonar rule) | [#128](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/128) | maharanianindya | [`4c8114b6`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/4c8114b6) `[GREEN] Keep a press on a connection badge with the badge itself … Sonar's S6848 is gone` (30 Oct) | Rule gone; the fix also simplified the component |
| 6 | **A module outside the measured surface** — `src/email` ran in neither Vitest nor SonarCloud coverage (identified as the sign-in work grew, SCRUM-240) | [#183](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/183) | EvelynOct | [`b55378a2`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/b55378a2) `Measure the email sign-in module in Vitest and SonarCloud coverage … and hold src/email to 100%` (4 Nov) | Module enrolled at the **100%** bar — the standard followed the codebase |
| 7 | **A gate that blocked more than it should** — the skipped Sonar job on `staging` used to skip `migrate`/`deploy` with it (identified by watching a staging run) | [#67](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/67) | Bastian | [`5788dc5a`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/5788dc5a) `Run the backend migrate and deploy jobs on staging, where the skipped Sonar job used to skip them too` (1 Oct) | `deploy` conditions now separate "gate skipped by policy" from "gate failed" |
| 8 | **S2699 — three assertion-less e2e test cases** ("Add at least one assertion to this test case", Maintainability · Blocker) in `test/content-links-api.e2e-spec.ts`, `test/invoices.e2e-spec.ts`, `test/nul-characters.e2e-spec.ts` — all asserting only through supertest's `.expect()`, which the rule does not count (Sonar issues) | *PR pending on `fix/fixing-assesrtions-sonarqube`* | **me** | [`337d656a`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/337d656a) `test(backend): assert the swap-frees-the-video, paging refusals and NUL-free save cases so Sonar S2699 passes` (19 Nov) | 63 e2e tests green on a CI-equivalent database (whole files, neighbours included); re-analysis on the PR closes the issues |

### 4a. The floating-promise problem (rows 1 & 4) — in detail

A **floating promise** is a `Promise` that is created but never `await`ed, `.catch`ed, or
explicitly discarded with `void`. SonarCloud flags these because an unhandled rejection silently
vanishes — the error path becomes a black hole, and the caller has no way to know the async work
failed. The rule is **S9383** (Sonar's floating-promise / no-misused-promises rule).

**Row 1 — the revise command (PR [#74](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/74), commit `e8afc967`).**
`PanelCommand.run()` may return a promise (opening the note form is synchronous, but the type
allows an async answer). The call site did `command.run()` with no handling — a textbook floating
promise. The fix wraps it with `void`:

```ts
// Before
command.run();

// After — `void` marks the ignored answer explicitly
void command.run();
```

`void` does not "fix" the promise; it tells the compiler and the linter *"I know this returns a
promise and I am deliberately not handling it."* In this case the operation is fire-and-forget:
opening a form does not need error handling at the call site because the form itself manages its
own error state.

**Row 4 — the comment thread's load chain (PR [#111](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/111), commit `c7ed3bf9`).**
A `useEffect` calls `comments.load(contractId).catch(...)` but never `await`s the result (a React
effect callback cannot be `async`). Sonar still saw the dangling chain. The fix adds `void`:

```ts
// Before
comments.load(contractId).catch((): CommentsOutcome => ({ ... }));

// After
void comments.load(contractId).catch((): CommentsOutcome => ({ ... }));
```

The `.catch` was already present (handling the error), so the promise was not truly *unhandled* —
but it was *floating* in the type system's eyes. The `void` operator makes the deliberate
discarding explicit.

**Why this matters for QA:** floating promises are a *class* of defects, not one-off typos. The
same pattern (fire-and-forget calls in event handlers, effects, and callbacks) appears across
every frontend codebase. Finding and fixing one instance proves the rule works; the team reusing
the same `void` pattern afterwards (rows 1 → 4) shows the standard propagating.

### 4b. The coverage gap at PR #134 — in detail

**What happened.** PR [#134](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/134)
reworked the filter bars (chip-based UI for content-plan, creator-content, and my-task filters).
The PR's Quality Gate reading measured **81.2% Coverage on New Code** and named exactly where
the uncovered new code sat: two **chip-removal callbacks** — the `onClick` handlers that fire
when a user removes a filter chip. (The exact gate floor is whatever the Quality Gate declares;
what matters here is that the project's own bar for *new* code is the stricter one —
effectively 100% before merge — so 81.2% was treated as a gap and closed as one.)

| File | What was untested |
|---|---|
| `content-plan-filters.test.tsx` | Chip-removal wiring in the content-plan filter bar |
| `my-task-filters.test.tsx` | Chip-removal wiring in the my-task filter bar |
| `creator-content-filters.test.tsx` | Chip row rendering without a reset button |
| `filter-chips.test.tsx` | The chip row component itself |

**The fix (commit `b7041e12`).** Four test files, **77 new lines**, all test-only changes. No
production code was touched. The tests simulate clicking a chip's remove button and assert the
correct filter state is cleared. Re-analysis: **100.0% Coverage on New Code**, Quality Gate passed.

**Why this matters for QA:** the Quality Gate *found what the tests missed* — the developer wrote
the feature and its primary tests but omitted the removal interaction. The response was to write
more tests, not to lower the threshold or exclude the file. This is the "Clean as you Code"
postline: new code must meet the bar before it merges.

### 4c. The assertion-less tests (row 8) — in detail

**What the rule is.** S2699 ("Add at least one assertion to this test case") flags a test that
runs code but never asserts — a test that passes even when the feature is broken. Sonar rated
all three **Maintainability · Blocker**, ~10 minutes' effort each.

**Why they were flagged, and why the flag was right.** Each case asserted only through
supertest's `.expect(status)`, which the rule does not count as an assertion. The gap was real
beyond the rule's vocabulary: each test's *name* claimed more than its *body* proved. "Frees
the old video for another content" accepted any 200/201 response without ever reading the
result; "rejects paging values" never checked the refusal named the paging value; "still saves
the same comment" never checked the comment was saved.

**The fix pattern** (one representative, the rest follow it):

```ts
// Before — asserts nothing the rule can see
await replace(linked.id, 'instagram', reel('new-4'), owner.creatorId).expect(200);
await submit(other.id, { instagram: reel('old-4') }).expect(201);

// After — the name's claim, proven
const replaced = await replace(linked.id, 'instagram', reel('new-4'), owner.creatorId);
expect(replaced.status).toBe(200);
expect((await stateOf(linked.id)).content_links).toEqual([
  expect.objectContaining({ url: reel('new-4') }),
]);
```

What each case now proves:

| Test case | What the name claims | What the assertions now prove |
|---|---|---|
| `frees the old video for another content…` | the swapped-out URL is reusable | the replacement landed **and** the other content holds the old URL (`stateOf`) |
| `rejects paging values that are not positive integers` | every bad value is refused | each 400 body **names its refused value** (`'page must be 1 or greater'`, `'pageSize must be between 1 and 50'`) |
| `still saves the same comment without the NUL character` | the comment is saved | `201`, the saved body (`text`, `authorRole`), and the stored-comment count grew by one |

**Verification.** The three whole files (63 tests) run green on a database bootstrapped
exactly like CI (`bootstrap-roles.sql` → `tofly_app` role → `prisma migrate deploy` →
`hand-off-ownership.sql`), lint clean — commit [`337d656a`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/337d656a),
re-analysis closes the issues on the PR.

**Why this matters for QA.** The incident extends the tool's role one step further: SonarQube
does not only police production code, it audits the *tests* — because an assertion-less test
is a defect in the QA system itself, and by construction it can never fail and report itself.
The response was the same discipline as row 2: strengthen the tests, never suppress the rule
(no exclusions, no ignored issue). One more class of "looks green, proves nothing" is now
machine-checked on every push.

---

### SonarCloud links

| Project | Dashboard | Issues | Coverage |
|---|---|---|---|
| Backend | [sonarcloud.io/summary/overall?id=PROPENSI-PPL-Tofly_tofly-ugc-management_backend](https://sonarcloud.io/summary/overall?id=PROPENSI-PPL-Tofly_tofly-ugc-management_backend) | [issues](https://sonarcloud.io/project/issues?id=PROPENSI-PPL-Tofly_tofly-ugc-management_backend) | [coverage](https://sonarcloud.io/component_measures?id=PROPENSI-PPL-Tofly_tofly-ugc-management_backend&metric=coverage) |
| Frontend | [sonarcloud.io/summary/overall?id=PROPENSI-PPL-Tofly_tofly-ugc-management_frontend](https://sonarcloud.io/summary/overall?id=PROPENSI-PPL-Tofly_tofly-ugc-management_frontend) | [issues](https://sonarcloud.io/project/issues?id=PROPENSI-PPL-Tofly_tofly-ugc-management_frontend) | [coverage](https://sonarcloud.io/component_measures?id=PROPENSI-PPL-Tofly_tofly-ugc-management_frontend&metric=coverage) |

Relevant PR analyses on SonarCloud (each PR gets its own "Coverage on New Code" reading):

| PR | What it covers | SonarCloud PR analysis |
|---|---|---|
| [#74](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/74) | Floating promise fix (revise command) | [PR #74 on SonarCloud](https://sonarcloud.io/summary/new_code?id=PROPENSI-PPL-Tofly_tofly-ugc-management_frontend&pullRequest=74) |
| [#111](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/111) | Floating promise fix (comment thread) | [PR #111 on SonarCloud](https://sonarcloud.io/summary/new_code?id=PROPENSI-PPL-Tofly_tofly-ugc-management_frontend&pullRequest=111) |
| [#134](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/134) | Coverage gap (chip-removal tests) | [PR #134 on SonarCloud](https://sonarcloud.io/summary/new_code?id=PROPENSI-PPL-Tofly_tofly-ugc-management_frontend&pullRequest=134) |

### Seeing the tool act (usage notes)

*   **The verdict of a push** — GitHub PR → *Checks* tab → "SonarCloud analysis" (one per
    package); the job log ends in `QUALITY GATE STATUS: PASSED/FAILED`, and the commit dropdown
    at the top of the tab shows the runs of earlier pushes — the before/after of any fix.
*   **The lifecycle of a finding** — SonarCloud → *Issues* → status **Resolved** plus the rule
    filter (e.g. `S9383`) lists every closed finding with the commit that closed it. Closed
    issues are kept: that is the durable record even long after a fix has merged.
*   **When analysis runs at all** — same-repo PRs and pushes to `main`; plain pushes to feature
    branches and `staging`, and fork PRs, are skipped by policy (§5). A "rejection on push" is
    therefore demonstrated on a PR (each push to the PR branch re-analyses) or a `main` push.

## 5. Regular, measurable, beneficial (L3)

**Regular.** Analysis runs on every pull request and every push to `main` for both projects
(early September onward, continuous). One run per branch at a time (a newer push cancels the
superseded run), coverage handed off as an artifact so tests never run twice. The measurement
layer beneath it is stricter still: vitest thresholds run on **every test invocation**, local or
CI.

**Measurable.** Quality Gate readings, by PR (all **passed**, 0 new issues, ~0 duplication):

| PR | Date | Coverage on new code |
|---|---|---|
| #105 | 19 Oct | 100.0% backend / 96.0% frontend |
| #132 | 2 Nov | **100.0%** |
| #134 | 31 Oct | 81.2% → **100.0%** after `b7041e12` |
| #135 | 31 Oct | 100.0% backend / 96.2% frontend |
| #147 | 3 Nov | 97.0% |

Measured state of the deploy branches: badges recorded **on `main`** — backend **100%**,
frontend **99%**; latest full runs at the merged tip — backend **148 files / 2,623 tests / 100%
statements, functions and lines**, frontend **193 files / 3,425 tests / 99.33% statements** —
6,048 tests green; the 100% standard is enforced per-module (the `src/auth` / `src/me` /
`src/email` / `src/storage` / money-path list fails the build below 100% on any of the four
metrics).

**Beneficial.** Three demonstrated effects: (1) the gate *finds what tests miss* and the response
is to write tests (81.2% → 100%); (2) named rule findings are fixed in the code and re-verified
(§4); (3) the standard *expands* with the codebase (`src/email` enrolled at 100% on 4 Nov)
instead of eroding. The complete benefit picture — defect classes caught at creation time, a
machine-enforced merge bar, the cost of quality moved left, the standard propagating, and
receipts for every claim — is §2.3.

**Guarding CI/CD with the SonarQube report.** The chain is `test` (lint + suite + coverage
artifact + build) → `sonar` (`-Dsonar.qualitygate.wait=true`, a failed gate is a failed job) →
`deploy` **needs `[test, sonar]`**, production requiring a passed gate, with the release behind a
candidate revision and a smoke test before traffic. On the rubric's "staging and master" wording:
this project's deploy branches are `staging` and `main`; `main` receives gate analysis on every
push and its gate gates production deploys, while `staging`'s sonar job is skipped **by written
policy — its code already passed the gate in the PR that brought it there** (with `5788dc5a`
fixing the one time that skip wrongly cascaded into migrate/deploy). Coverage on `main` is the
badge (100% backend / 99% frontend, the frontend remainder named and outside every
security-critical module) and "no more issues" holds as **0 new issues on every analysed ref**
with historical findings resolved rule-by-rule (§4). Taking the frontend remainder to a literal
100% is the same mechanical coverage-gap treatment as row 2 — method proven, work itemized.

## 6. How each rubric column is answered

*   **L1** (relationship + standard pattern): §1 (the four-part relationship and the layered QA
    model), §2 (what SonarQube does and what the project gains from it), and §3 (the six-step
    standard pattern mapped to this project's mechanisms).
*   **L2** (issue identification → resolution, with commits): §4 — eight concrete cycles, each
    with the identifying analysis, the author, the commit and the verification.
*   **L3** (regular, measurable, beneficial; SonarQube guarding CI/CD; 100% standard on the
    deploy branches; no open issues): §2 (usage and benefits) and §5 — cadence, the per-PR gate
    table, the main-branch badges and thresholds, the CI/CD gate chain, and the honest treatment
    of the staging/master wording.
