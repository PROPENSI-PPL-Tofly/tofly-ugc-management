# Sprint [X] Week [Y] Part C - [Student Name]

**Author:** [Student Name] (NPM: [NPM])
**Period:** [Date Range]
**Repository:** https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management

**Scope of this reflection:** PBI-38 / SCRUM-228 (*Show the submitted video links and hold the deadline picker at the H-5 line* — branch `feat/link-display-deadline-picker_228`, PR #132, merged 2 Nov into `feat/pbi-38-multi-platform-links`) and PBI-27 / SCRUM-234 (*Read-only performance links for creators and the Performa Konten table* — branch `feat/creator-performance-view_234`, PR #147, merged 3 Nov into `feat/pbi-27-performance-sync`), plus the OWASP ZAP security-scanning chore delivered on `_234` — 38 commits across the two subtasks and the chore.

---

## 1. Aptitude, Applying Knowledge

This week's work moved from page-building into two areas course material does not cover: security tooling wired into the development workflow itself, and consuming a backend contract that was still moving underneath the UI. Both demanded guarantees the standard "call the API and render" approach does not provide.

### 1.1 DevSecOps: OWASP ZAP wired into the workflow, with a written severity policy (beyond "run a scanner")

Instead of running OWASP ZAP once by hand, the baseline scan was engineered into the development workflow three ways (commit [`a0ac1afc`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/a0ac1afc) + fixes): a local CLI (`scripts/zap.ps1`, the official `ghcr.io/zaproxy/zaproxy` container running `zap-baseline.py` against the built app), a **pre-push git gate** (`githooks/pre-push` — the same passive scan blocks a push only on FAIL-level findings, warns otherwise, with an explicit bypass), and a **CI workflow** (`.github/workflows/zap.yml` — every push, path-filtered, one scan per branch at a time). The scan is strictly passive (spider + passive rules, no attack payloads) and runs against the real stack: PostgreSQL → backend → frontend, seeded so the spider meets real rows.

The non-standard part is the **severity policy**: `.zap/rules.tsv` decides per rule what gates and what merely reports, with each deviation's reason recorded in the file. The first scan surfaced **2 Medium** (a CSP wildcard directive and `style-src 'unsafe-inline'` on `/api/auth/google`, where the framework's default CSP serves the OAuth hand-off), **3 Low** and 4 informational findings over 21 endpoints — triaged as tracked findings with an owner and a decision, not as noise. The two transport-only checks (Secure cookie flag, HSTS) are IGNOREd *because the scan target is plain HTTP* — and flagged to become FAIL-level the day the scan moves to the HTTPS staging URL (OWASP A05).

**Why this goes beyond the standard requirement:** a course exercise runs a tool; this is pipeline security engineering — repeatable gating, a reviewed policy file, and findings tied to the OWASP Top 10 with an explicit date for tightening them.

### 1.2 Consuming a moving API contract: legacy and replaced states as first-class values

SCRUM-228 renders links exactly as subtask 38.1 *sends* them: `platform` is nullable, `submittedAt` arrives as a day, and a replaced link carries its own `replaced` flag. Rather than scattering checks, one adapter reads `ContentLink` and makes the awkward states values instead of conditionals: a link from before platforms were recorded lists as "Link", unnamed and unmarked, instead of pretending to a platform it predates ([`c0bbfc1c`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/c0bbfc1c)); a replaced link words itself "Link &lt;platform&gt; diganti" from the payload's own flag. A missing `links` field is read as an answer that *predates* the field — the panel renders its journey where it actually is instead of crashing on a contract that moved ([`b88a981d`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/b88a981d)).

The deadline picker implements the H-5 business rule in the API's own words — the day is bounded at contract end minus five days — and the bound is *explained* in a keyboard-reachable InfoTip beside the Deadline label (AC 14) rather than hidden in a hover-only title. The same day-bound logic refuses anything past the line at the edge, with `today` passed in so the rule is testable across midnight and boundary days.

**Why this goes beyond the standard requirement:** class exercises have stable, first-version contracts. Here the contract moved mid-sprint and carried pre-contract data — the design goal became *absorbing history without lying about it*, an edge-case discipline the standard approach only meets at integration, when it is expensive.

### 1.3 Data-integrity seam: refusing an unusable 200, and session-scoped reads

SCRUM-234's Performa Konten table is fed by `GET /performance/links` through one seam (`performance-links.server.ts`) that validates the answer's list grammar on the way in and **throws on an answer it cannot read** — a wrong-shaped success can never paint a wrong table (OWASP A08). One pure module (`performance-links.ts`) owns the rows, the URL state and the query, tested without a DOM and without a network, and one shared `link-performance-table.tsx` draws *both* lists (a creator's links and a content's links) from a single column definition. On the creator side, the rows come from the session with deliberately **no creator in the address** — the panel cannot be pointed at anyone else — and a 403 is rendered as the panel's own failure state (OWASP A01). The read-only stance is not promised but pinned: a `[TEST]` commit asserts that the creator's cards offer no sync and no manual input, so a later button cannot quietly appear ([`24bf8436`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/24bf8436)).

**Why this goes beyond the standard requirement:** rendering whatever a 200 returns is the default; refusing a success that violates its own contract, and pinning a security stance in the suite, are integrity and access-control practices from OWASP API Security, not from the frontend syllabus.

---

## 2. Grow Together, Communication, Knowledge Sharing

### 2.1 A contract-first review of the API my UI consumes

I reviewed Bastian2312's PR #131 (SCRUM-226, the submit-and-replace-video-links API that SCRUM-228's UI is built on) — not as a general read but **against the exact contract my rows would parse**: the nullable `platform`, the day-typed `submittedAt`, and the `replaced` flag my "Link &lt;platform&gt; diganti" wording derives from. I approved on 30 Oct with the contract observations recorded, and my PR #132 was cross-linked to it the next day so reviewer, API author and frontend consumer could read both sides together — the kind of review that prevents a merge-time surprise rather than finding one.

### 2.2 Integration duty and review cycles on my own work

- On 30 Oct I held integration duty and merged the team's PR #126 (Instagram connection flow) and PR #128 (admin badges & privacy page) into their integration line — keeping the subtask branches rebased on the shared work they consume, so nobody builds on stale ground.
- Both of my PRs went through real review before merge (#132 and #147, merged by the integrator on 2 and 3 Nov), and the feedback was applied as visible commits rather than silent fixes — e.g. the read-only pinning and the 403-as-failure rendering in [`24bf8436`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/24bf8436) — so the reviewer could verify each answer in the diff.

### 2.3 Sharing the security tooling as team configuration

The ZAP chore was delivered as **reusable team configuration, not a personal script**: `scripts/zap.ps1` (works locally on any machine with Docker), `githooks/pre-push` (opt-in per clone with one command, safe bypass semantics), `.zap/rules.tsv` (the severity policy with every deviation's reason written down), and `ZAP_ON_PUSH_REPORT.md` (how to read the findings). The CI workflow was deliberately scoped so it can never slow down, fail or otherwise touch a teammate's work. This is the "sharing configuration files" activity at the center of the Grow Together criterion: the next teammate gets a working security gate with documentation, not a walkthrough.

**Impact:** the 2.1 review guarded the week's largest cross-person dependency (the API my whole subtask reads); 2.2 kept the shared lines moving; 2.3 turned a one-person security chore into team infrastructure the moment it landed.

---

## 3. Commitment, Work Ethic

### 3.1 Tasks completed on schedule

- **SCRUM-228 — Link display & deadline picker** (PBI-38 subtask 38.4): one row per submitted link in Content Detail with its platform mark, its date and its own platform-named timeline event; sent-link marks read from the list's `platforms` field (AC 13); legacy links listed honestly as "Link"; replaced links worded from the payload's flag (AC 9); the marks under the content name above the type label in all three tables; and the deadline picker held at contract end minus H-5 with the bound explained in a keyboard-reachable InfoTip (AC 14). Delivered on `feat/link-display-deadline-picker_228`, [PR #132](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/132) — **merged 2 Nov, on schedule**.
- **SCRUM-234 — Creator Performance View / Performa Konten** (PBI-27 subtask 27.6): one link table drawing both lists with platform marks, the four numbers in Indonesian wording, state with explanation and last sync; creator and platform filters over the live address with pagination bracketing the rows above and below; a pressed row opening its content's Detail with a copied name staying harmless; a per-row **Sinkronkan** that holds its rows while syncing and toasts the outcome; the **Hubungkan** prompt for unconnected accounts; and the creator's own read-only links under Akun Terhubung — ten a page, empty and error states, no creator in the address. Delivered on `feat/creator-performance-view_234`, [PR #147](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/pull/147) — **merged 3 Nov, on schedule**.
- **ZAP Baseline Security Scanning — security chore**: the three-surface scan pipeline and severity policy described in 1.1, plus its CI-ordering fix ([`442ceb3f`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/442ceb3f)).

### 3.2 Disciplined engineering practice

- **Strict TDD, 38 commits in convention:** 16 RED/GREEN pairs (e.g. [`80a29f4c` [RED] *Expect each link to show its mark, its date and its own timeline event*](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/80a29f4c) → [`bb3cee2e` [GREEN]](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/bb3cee2e); [`8cdc9139` [RED] *…refuse an unusable 200* → `5ca25a33` [GREEN]](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/8cdc9139)), plus 3 `[FIX]`, 1 `[TEST]` and 1 `[REFACTOR]` commit — every test isolated behind mocked seams (`next/navigation`, the server seams, partial `importOriginal` mocks, component stubs) so a red test is always the code's, never the network's.
- **Coverage held at the top of the range:** at the merged tip — frontend **193 files / 3,425 tests / 99.33% statements, 99.1% branches, 99.17% functions, 99.55% lines**, backend **148 files / 2,623 tests / 100% statements, functions and lines** — **6,048 tests green**, far above the 80% CI threshold.
- **Quality Gate as the merge bar:** SonarCloud passed on both PRs — **PR #132 at 100.0% coverage on new code** (1.7% duplication), **PR #147 at 97.0% on new code** (0.0% duplication) — enforced on every push (`sonar.qualitygate.wait=true`), with lint and `tsc --noEmit` clean. No coverage suppressions were used to close a gap.

### 3.3 Time log (≈17 hours)

- **Coding & Implementation — 8 hours.** SCRUM-228: `platform-icon.tsx` and the per-link rows with their marks, dates and platform-named timeline events, the legacy/replaced wording, the marks in all three tables, and the H-5-bound picker with its InfoTip. SCRUM-234: `performance-links.ts` as one pure module, the validating seam in `performance-links.server.ts`, the shared `link-performance-table.tsx`, the Performa Konten page with its filters, pagination, per-row Sinkronkan and Hubungkan prompt, and the read-only Akun Terhubung cards. The ZAP chore's script, hook and workflow wiring, and the post-review rework ([`b88a981d`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/b88a981d), [`558729a1`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/558729a1) taking the Google Fonts build flake out via Next 16.4.3, [`24bf8436`](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/commit/24bf8436)).
- **Testing (Unit / TDD) — 4 hours.** Writing the 16 RED specs first, one per pair; the edge-case specs (the missing `links` field as an old answer, the harmless copied name, the replaced-link wording from the payload's flag, the day-bound picker refusing anything past H-5, pagination bracketing above *and* below, the "Belum ada link yang dikirim" empty state, the unusable-200 refusal); closing the named coverage gaps to the numbers in 3.2; and the single full-suite finish gate (lint + `tsc` + both suites) run before every push.
- **Code Reviews & PR write-ups — 3 hours.** The PR #131 contract review in 2.1 (diff reading against the 38.1 payload, the recorded approval comment, the cross-linking of #132); integration duty merging PR #126 and PR #128 with their checks verified; and writing both PR descriptions in the team template with an honest deviations section, plus answering each review finding with evidence in-PR.
- **Sprint Planning & Meetings — 2 hours.** Sprint planning and subtask breakdown (38.4 / 27.6); a sync with the 38.1 owner to lock the `ContentLink` payload shape my rows parse; and the PBI-27 discussion that fixed the shared sync-call boundary between the Performa Konten table and the per-row Sinkronkan.

**Total: 17 hours.**
