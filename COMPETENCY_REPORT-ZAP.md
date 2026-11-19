# Competency Report — OWASP ZAP in the Workflow (security scanning on every push)

Scope: the OWASP ZAP scanning system I built into `tofly-ugc-management` — local CLI
(`scripts/zap.ps1`), pre-push gate (`githooks/pre-push`) and CI workflow
(`.github/workflows/zap.yml`) with its scan-as-code configuration (`zap.yaml`, `.zap/rules.tsv`) —
and the team outcomes it produced. Primary rubric target: **Team Work with tools (CPL 2 IAR),
Level 3** — "provides solutions to issues that occur so they benefit the team … maximizing the
use of tool features from requirements through to deployment … including integration between
tools to maximize teamwork." Secondary: Secure Programming (CPL 6 ES) and More Testing
(security testing tools).

The work spans five commits (`a0ac1afc`, `442ceb3f`, `f3f2b9b1`, `4f02321f`, `58992b7d`, 2–4 Nov 2026).
Downstream team work triggered by the scans — the security assessment and the two patches — is
attributed to its author (EvelynOct) wherever it appears, because the tool producing findings
*for the team* is the point of this report.

---

## 1. What is the problem without this CI system?

Before the ZAP workflow existed, the project's web-security posture was checked **only when
someone remembered to look**, and that created five concrete problems:

1. **Security regressions were invisible to every other gate.** The functional suite, SonarQube
   and the e2e tests all ask "does it work?" — none of them asks "is it *safe*?". A page-oriented
   Content-Security-Policy with wildcard and `'unsafe-inline'` sources on API responses (the real
   finding, below) renders nothing wrong; every test stays green while the header quietly weakens
   every response that reaches a browser. Same for a JSON body containing a NUL character
   crashing five endpoints with an HTTP 500: no happy-path test would ever have caught it.
2. **Findings arrived late and cost the team late.** The iteration-2 UAT round is the proof of
   the pattern: issues discovered at acceptance are the most expensive kind — they become urgent
   tickets, they compete with feature work, and they are fixed under time pressure. A scanner
   nobody runs produces the same result: bugs found by the client, not by the pipeline.
3. **No evidence trail.** There was no record of what had been checked, when, or with what
   result — nothing to hand a reviewer, a lecturer, or an auditor, and nothing to compare a
   "before" against.
4. **Security knowledge was siloed.** Knowing that helmet's defaults are page-oriented, or that
   NUL bytes in JSON are an A10 hazard, lived in individuals' heads. When that person was
   looking the other way, the knowledge did not apply.
5. **Manual one-off scans do not compound.** A scan run once in a terminal is forgotten by next
   week; it does not guard the next change, it does not cover teammates' changes, and it cannot
   fail a build.

## 2. What are the benefits of this system?

1. **Every push gets a web-security check, automatically.** The baseline scan (spider + client
   spider + passive rules) runs in CI on every push to every branch — since 4 Nov for every
   pusher, not only me (see §6). Security review moved from an event to a property of the
   workflow.
2. **It found what the test suite structurally could not.** The first scans surfaced the two
   confirmed vulnerabilities later documented in the security assessment: **V1** — a NUL
   character in a JSON text field causes an HTTP 500 on five endpoints (Low, OWASP A10:2025);
   **V2** — the backend serves helmet's page-oriented CSP (wildcard + `'unsafe-inline'`) on
   responses that reach the browser (ZAP Medium, real impact Low, OWASP A02:2025).
3. **The findings were fixed and the fix was verified — before/after is documented.** Both
   vulnerabilities were patched with RED → GREEN regression tests (`8a6b1d6f` → `ce7807c5` for
   the CSP, `default-src 'none'; frame-ancestors 'none'`, merged as PR #159) and **the rescan no
   longer reports them** — the assessment's own words. A scanner whose findings get fixed and
   re-verified is a working control, not a report generator.
4. **It multiplied across the team at zero friction.** Path-filtered triggers, one scan per
   branch (a newer push cancels the superseded run), warnings report instead of blocking, and an
   explicit bypass (`ZAP_SKIP=1` / `git push --no-verify`). Nobody is slowed by the tool; the
   first weeks ran on my pushes only so it could not destabilize anyone else's work (§6).
5. **Judgement is written down, not tribal.** `.zap/rules.tsv` is a severity policy: FAIL blocks,
   WARN reports, IGNORE requires a reason — the two transport-only rules (cookie `Secure`, HSTS)
   are IGNOREd *because the scan target is plain HTTP*, with the note that they become real
   findings the day the scan moves to the HTTPS staging URL. Six ZAP alerts were classified as
   false positives *with their reasons recorded* instead of being silenced.
6. **The knowledge problem is solved by encoding.** The team's security knowledge now lives in
   the repo — the workflow, the rules file, and `docs/security/tofly-security-assessment.md` —
   and anyone can run the same scan locally with one command.

## 3. Why ZAP, and why baseline-first?

*   **ZAP** is the OWASP-standard, open-source web scanner; it is dockerized
    (`ghcr.io/zaproxy/zaproxy:stable`) so the exact tool version is reproducible on any machine;
    its Automation Framework is configured in versioned YAML (`zap.yaml`) — the scan is code,
    reviewed through PRs like any other change.
*   **Baseline (passive) in the always-on pipeline, active in the controlled assessment.** The
    passive scan sends no attack payloads — it cannot corrupt state in a shared or production-like
    environment, so it is safe to run on *every push*. The aggressive scans (full scan with active
    attacks, authenticated API scans) ran against a disposable local copy in the 3 Nov assessment
    where state does not matter. Severity is layered the same way: what blocks a push (FAIL) vs
    what merely reports (WARN).
*   **Against alternatives:** Metasploit is exploit-driven and far too heavy for a per-push gate;
    Nuclei is template-matching of known CVEs rather than response-analysis of *this* app's
    behaviour; Nikto is dated and noisy. ZAP's passive rules + spider are the right tool for a
    per-push web-security gate, and its active mode covers the deep-dive case too.

## 4. Architecture — one security check at three layers

| Layer | Where | When | What it catches | Failure behaviour |
|---|---|---|---|---|
| Local CLI | `scripts/zap.ps1` (Docker, `zap-baseline.py -c .zap/rules.tsv`) | While developing, on demand | Findings before a commit exists | Report files land in the repo root (git-ignored) |
| Pre-push gate | `githooks/pre-push` (`git config core.hooksPath githooks`) | The last moment before publishing | A push that introduces a FAIL-level finding | **Blocks the push** on FAIL only; warns otherwise; skips cleanly when Docker/the app is down; `ZAP_SKIP=1` to bypass deliberately |
| CI workflow | `.github/workflows/zap.yml` (`zaproxy/action-baseline@v0.15.0`) | **Every push, every branch** | The same, on infrastructure that cannot be skipped locally | `fail_action: true` — FAIL-level alerts turn the check red; report artifact uploaded on every run |

Configuration is shared across all three (`zap.yaml` + `.zap/rules.tsv`), so the local result and
the CI result are the same scan, and the policy is edited in one place.

## 5. Maximizing the tool from requirements through to deployment

| Stage | How the ZAP setup uses the tool's features |
|---|---|
| Requirements | The rules file encodes *what the app must satisfy* as policy (FAIL/WARN/IGNORE per rule id). The seeded scan database carries real-shaped rows (creators, contents with links) so the spider meets the features the requirements describe instead of empty lists and 404s that hide whole sections of the app. |
| Development | One-command local scan; pre-push gate as the last line; scan-as-code config reviewed in PRs. |
| Testing | The CI scan boots the **whole real stack** (Postgres 17 service with the same major as Cloud SQL, `prisma migrate deploy` + the repo's seed, backend + Next standalone), uses the **client spider (`-j`)** so the React SPA is actually crawled, and gates on `/api/health` — the same frontend → backend → database path the deploy smoke test checks — so the scan never runs against a half-booted app. |
| Deployment | The scan stands *before* merges and deploys in the same pipeline that deploys staging/production (test → sonar → deploy); transport-only rules are explicitly deferred to the HTTPS staging URL, i.e. the policy knows the deployment topology; the assessment's scans ran against a disposable container DB so no developer or deployed environment was ever touched. |
| Operations | Report artifacts per run (HTML/MD/JSON) give a dated evidence trail; the severity policy is tuned as the system matures (`fail_action`, `maxAlertsPerRule`, rule-level IGNORE with reasons). |

## 6. Integration between tools — and what each link buys the team

*   **GitHub Actions ↔ ZAP Automation Framework** (`zaproxy/action-baseline`): the scan runs on
    the same events as tests and deploys — one pipeline, one place to look.
*   **Docker ↔ ZAP**: the scanner is an ephemeral container; no agent installs, identical local
    and CI behaviour.
*   **Postgres service ↔ Prisma ↔ seed data** (same SQL and order as Backend CI): the spider
    crawls authenticated-looking pages with real rows, which is why the scans reach 21+
    endpoints instead of a login wall. The `[FIX]` commit (`442ceb3f`) exists precisely because
    this integration was wrong at first — the scan's database step was ordered before `npm ci`,
    so `npx prisma` resolved the wrong Prisma CLI and refused `migrate deploy`. Fixing tool
    integration bugs is part of making tools actually work for the team.
*   **`/api/health` ↔ the scan gate ↔ the deploy smoke test**: one health contract used by two
    gates (scan-before, deploy-after).
*   **git hooks ↔ CI**: the same scan blocks locally on FAIL and reports in CI — a developer
    learns about a finding *before* the push, not from a red build afterwards.
*   **ZAP ↔ SonarQube**: static analysis (code-level rules, coverage gate) and dynamic scanning
    (what the running app actually sends) cover each other's blind spots — the CSP finding was
    invisible to Sonar and trivially visible to ZAP, and vice versa for S8786/S6848.
*   **ZAP ↔ the e2e sign-in machinery**: the assessment's authenticated scans created sessions
    through the app's own `AppSessionService`, "the same way the end-to-end tests sign in" —
    no guard was bypassed and no real credential existed.

## 7. The rollout — a solution handed to the team responsibly

1. **2 Nov (`a0ac1afc`):** the system lands — local CLI, pre-push gate, CI workflow — running on
   **my own pushes only** (`if: github.actor == 'wilsonsangpedagang'`), with the reason written
   in the workflow: "For now, just for me … nothing here can slow down, fail or otherwise touch
   anyone else's work."
2. **2 Nov (`442ceb3f`):** self-review catches the Prisma-ordering integration bug (above).
3. **3 Nov (`f3f2b9b1`):** rules touched to retrigger the baseline — validating the pipeline
   end-to-end, then the scans feed the security assessment (below).
4. **4 Nov (`4f02321f`, `58992b7d`):** once stable and proven harmless, the actor guard is
   **dropped** — the scan now runs on every push by anyone. The tool graduated from personal
   safety net to team infrastructure.

This arc is deliberate: a new gate that breaks teammates' builds teaches the team to bypass
gates. The canary-first rollout meant the team's first experience of the scanner was a working,
quiet one.

## 8. Findings and dispositions (from the 3 Nov security assessment)

The assessment (`docs/security/tofly-security-assessment.md`, authored by EvelynOct on top of
this scanning infrastructure) ran four scan types — API scan as admin, API scan as creator, full
scan (spider + active attacks), and baseline — against a local, isolated copy with fictional
data. Result:

| Class | Count | Detail | Disposition |
|---|---|---|---|
| Confirmed vulnerabilities | 2 | **V1** NUL byte in a JSON text field → HTTP 500 on 5 endpoints (Low, A10:2025); **V2** page-oriented CSP with wildcard + `'unsafe-inline'` on browser-reaching responses (ZAP Medium, real impact Low, A02:2025) | **Both patched with RED → GREEN regression tests; rescans no longer report them.** The CSP fix (`default-src 'none'; frame-ancestors 'none'`, keeping helmet's other headers) cites "ZAP's baseline flagged" in its commit body (PR #159) |
| Potential (recommended) | 3 | COOP/COEP missing on frontend pages (Low); no `Cache-Control` on authenticated API responses (Info); template `GET /` "Hello World!" route exposed (Low) | Recorded with recommendations |
| False positives / informational | 6 | Including "dangerous JS functions" (ZAP's own payload rendered escaped) and "potential XSS" (output is escaped) | Documented **with reasons**, not silenced |
| Critical / High | 0 | Access control held in every scan: unauthenticated requests to protected routes got 401 | — |

Scan-scope discipline (the part a grader should ask about): only `host.docker.internal:3000/:3001`
was ever scanned; the database was a disposable PostgreSQL container with the repository's
fictional seed users; sessions were real app sessions from the app's own session service; DELETE
and state-ending routes, uploads, logout and external OAuth redirects were deliberately excluded
from the scan surface; DoS and destructive exploitation were out of scope on principle. The
full-scan route reconciliation is recorded honestly — 27 of 51 unique routes scanned, 24
excluded by policy, 1 excluded by mistake — with the limits stated in the document.

## 9. Judgement calls and guardrails

*   **FAIL-only blocking** (`fail_action: true`, `-I`): a warning never blocks a push; only a
   FAIL-severity finding does. Warnings inform; the merge is not held hostage by noise.
*   **Explicit bypass valves** (`ZAP_SKIP=1`, `--no-verify`): emergencies can push, but the
   bypass is a visible decision, not an accident.
*   **`DEV_AUTH_ENABLED` in the scan job only** — the guards' local stand-in so the spider crawls
   real pages instead of a login wall. The workflow records the guard rails: the guards refuse it
   whenever `NODE_ENV=production`, and it is set nowhere else in CI or the deploy jobs.
*   **Reports are git-ignored** (`zap-report*`): scan output is evidence, not repository noise;
   CI keeps its copy as a run artifact.
*   **Everything the scan touches is fictional or disposable** — no deployed environment, no real
   user data, no real credentials.

## 10. Limitations and next steps (honest)

*   The always-on pipeline runs the **passive** baseline; active attack scans are for the
   controlled assessment environment only (by design, and documented).
*   The CI spider crawls through one dev-auth stand-in; the assessment additionally scanned
   **as admin and as creator with real sessions** — a future upgrade is a per-role authenticated
   scan in CI.
*   The full scan reached 27 of 51 unique routes (24 excluded by policy); widening the safe
   surface (e.g. read-only GETs currently excluded) is a known follow-up.
*   The two transport rules stay IGNOREd until the scan targets the **HTTPS staging URL** —
   then they flip to real findings, and the policy says so in advance.
*   The three "potential" findings (COOP/COEP, `Cache-Control`, the template route) are
   recommended next patches with the same RED → GREEN method.

## 11. Rubric mapping

| Rubric | Level reached | The evidence |
|---|---|---|
| **Team Work with tools (CPL 2 IAR)** — solutions to issues benefiting the team; tool features from requirements to deployment; integration between tools | **3** (arguable 4: the rollout and adoption are measurable — every pusher scanned, findings fixed by a second person, tool-integration bugs fixed as they appeared) | §1–§9, especially the rollout (§6/§7), the lifecycle map (§5), the integration graph (§6) and the cross-person fix loop (§8) |
| **Secure Programming (CPL 6 ES)** — use security screening tools to show vulnerabilities | **3**, and the before/after of §8 additionally satisfies the Level-4 wording ("before and after of code fixed based on screening") for the CSP finding | §8 |
| **More Testing — security testing (CPL 6 IAF)** — demonstrate advanced testing tools and their output; benefit backed by data | **2** (demonstrated + beneficial with concrete data); Level 3's "follows current literature" is supportable via ZAP's OWASP standing and the baseline/full-scan methodology | §2, §3, §8 |
| **Static Analysis / QA (CPL 6 MRA)** — regular, measurable, beneficial | strengthens the A3 dossier: dynamic scanning complements the Sonar gate on the same cadence | §2, §5 |
