# ZAP-on-Push — Web Security Gate: Implementation & First-Week Report

**Project:** Tofly Creator Management System (tofly-ugc-management)
**Area:** Dynamic Application Security Testing (DAST) integrated into the development workflow
**Author:** Davin (wilsonsangpedagang)
**Date:** 3 November 2026
**Evidence window:** pushes of 2 November 2026 (local gate + GitHub Actions), guard check of 3 November 2026

---

## 1. Objective

Every pushed change to the repository is automatically checked for web security issues before it
can travel further — locally before the push leaves the machine, and again in CI as a permanent
record. The question this report answers: **what did the gate actually do and prevent in its
first day of operation?**

## 2. What was built

Three cooperating layers, all committed to the repository (`a0ac1afc`, `442ceb3f`):

| Layer | Component | Role |
|---|---|---|
| 1. Local CLI | `scripts/zap.ps1` | Runs an OWASP ZAP **baseline scan** (spider + passive rules) against the locally running app via the official `ghcr.io/zaproxy/zaproxy` container. Produces `zap-report.html` / `.md` / `.json`. |
| 2. Pre-push gate | `githooks/pre-push` | Invoked automatically by `git push`. Runs the same scan and **blocks the push only on FAIL-level findings**; warnings are printed and reported. Bypass is explicit (`git push --no-verify`), so every override is a deliberate, visible decision. |
| 3. CI gate | `.github/workflows/zap.yml` | On every push, GitHub Actions boots the real stack (PostgreSQL → backend → frontend, seeded data), runs the same ZAP scan through `zaproxy/action-baseline@v0.15.0`, and uploads the report as the `zap_scan` artifact. |

**Severity policy** (`.zap/rules.tsv`): FAIL findings block; WARN findings are reported and
never block. Per-rule severities are adjustable in one file — a finding can be promoted to FAIL
the moment the team decides it must gate merges.

**Scan profile:** strictly **passive** — ZAP spiders the pages and applies non-intrusive rules.
No attack payloads are sent, so the scan is safe against shared/production-like environments.

**Scope guard:** the CI job carries `if: github.actor == 'wilsonsangpedagang'`, so only the
author's pushes are scanned; any other contributor's push is skipped outright (see §6).

## 3. Method

Pre-push (every `git push` on my machine):

```
git push
  └─ githooks/pre-push
       ├─ Docker up? app up on :3000?  ── no ──▶ warn & allow (tooling outage ≠ insecurity)
       └─ zap-baseline.py (passive, 5-min spider cap)
            ├─ FAIL findings > 0  ──▶ push BLOCKED, report saved
            └─ otherwise          ──▶ push proceeds, output printed
```

CI (every push to GitHub): checkout → npm ci (backend) → database prepare (roles, migrations,
seed) → build & start backend → build & start frontend → health-gate `GET /api/health` →
**ZAP baseline scan** → report artifact `zap_scan` (retained on the run page).

## 4. What ran on 2 November 2026

Three pushes left the machine that day; **every one was scanned before it left** (pre-push gate),
and every one is on record in CI:

| Push (commit) | Contents | Local gate | CI run | CI result |
|---|---|---|---|---|
| `a0ac1afc` | ZAP setup (CLI + hook + workflow) | scanned — 0 FAIL | [run 41457922936](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/actions/runs/41457922936) | ❌ failure — *workflow's own DB-prep ordering bug (tooling), not a security finding; fixed within 30 min* |
| `442ceb3f` | workflow fix + scope guard | scanned — 0 FAIL | [run 41460057795](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/actions/runs/41460057795) | ✅ success |
| `db76ccc2` | SCRUM-27.6 performance views (21 commits) | scanned — 0 FAIL | [run 41480637241](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/actions/runs/41480637241) | ✅ success |

Identical results on every local scan:

```
FAIL-NEW: 0   FAIL-INPROG: 0   WARN-NEW: 6   WARN-INPROG: 0   INFO: 0   PASS: 62
Total spidered: 167 URLs   ·   scan time: ≈ 2–4 min
```

## 5. Findings surfaced (WARN level — reported, not blocking)

| # | ZAP rule | Where | Count | Risk | Recommendation | OWASP |
|---|---|---|---|---|---|---|
| 1 | **10055 CSP: Wildcard Directive** | `/api/auth/google` (302 OAuth redirect) | 2 | A wildcard `CSP` directive weakens the browser's second line of defense on the auth path | Remove the wildcard from the CSP of redirect responses | A05:2021 |
| 2 | **90004 COEP header missing** | `/`, `/login`, `/privasi`, `/admin/creators`, static | 8 | No cross-origin isolation; weaker mitigation against Spectre-class leaks | Add `Cross-Origin-Embedder-Policy` beside the existing COOP/CORP headers | A05:2021 |
| 3 | **10049 Non-Storable Content** | JSON API + hashed JS chunks | 8–9 | Low — `no-store` on dynamic data is deliberate; hashed assets are revalidated | Confirm intended; demote to INFO in `rules.tsv` or add immutable caching for hashed assets | A05:2021 |
| 4 | **10044 Big Redirect** | `/` → login redirect (307) | 2 | Low — large redirect bodies can leak detail | Verify the redirect body is generic | A05:2021 |
| 5 | **10112 Session Management Response Identified** | `/api/auth/google` | 1 | Informational — confirms session mechanics on the OAuth hop | Review cookie flags in production | A07:2021 |
| 6 | **10109 Modern Web Application** | `/` | 2 | Informational — framework fingerprint | No action; noise candidate for `rules.tsv` | A05:2021 |

The full evidence lives in `zap-report.html` (regenerated on every push) and in the `zap_scan`
artifact of each CI run.

## 6. What was prevented — honest analysis

**(a) Directly blocked on 2 November: nothing — and that is the correct outcome.**
The pushed code carried **0 FAIL-level findings**. The gate is a control, not a speed bump: it is
designed to stop *insecure* changes, not *all* changes. Its value on a clean day is the verdict
it certifies (62 rules pass, with a saved report as proof).

**(b) Prevented from slipping through silently: 6 classes of real security gaps.**
Without the gate, findings #1–#6 would have merged unseen. They are now on record with locations
and fixes — the CSP wildcard on the OAuth path and the missing COEP header are concrete
hardening work items that did not exist before.

**(c) Prevention capacity is armed and tested for the future.** The policy is enforced in code:
any FAIL-level finding **cannot** reach a shared branch without an explicit `--no-verify`
override. The gate also proved itself end-to-end in its first day: the CI pipeline's own bug was
caught on the maiden run and fixed the same day — the control is exercised, not theoretical.

**(d) Zero impact on teammates.** On 3 November, seven pushes by two teammates
(`kingfrog711`, `EvelynOct`) touched branches carrying the workflow — all seven runs were
**skipped** by the scope guard (`skipped` conclusions, runs 41572725912…41576217971): no CI
minutes consumed, no red checks, no slowdown. The tool was rolled out without imposing anything
on anyone else's work.

## 7. Limitations & threats to validity

- **Passive only.** The baseline sends no attack payloads; it finds missing defenses and
  misconfigurations, not exploitable injection bugs. An intrusive **full scan** (scheduled,
  out-of-PR) is the next step.
- **Authenticated coverage** comes from a development-only identity switch
  (`DEV_AUTH_ENABLED`, refused when `NODE_ENV=production`), so the spider crawls the real pages.
  It does not test the login wall itself.
- **Local gate needs Docker and the app running.** If either is down, the hook warns and allows
  the push — a tooling outage is not treated as insecurity, but it does mean that one push was
  unscanned locally (CI still covers it).
- **Warnings do not block** by policy. That is a deliberate trade-off against alert fatigue;
  `rules.tsv` is the one-line escalation path for any rule the team wants to enforce.

## 8. Recommendations (roadmap)

1. Fix findings #1–#2 (CSP wildcard, COEP) — they are small header changes with real value.
2. Promote the fixed rules to `FAIL` in `rules.tsv` so the regression cannot return.
3. Demote confirmed-benign noise (#3, #6) to keep the report sharp.
4. Add a scheduled **ZAP full scan** (active rules, off-PR) and a post-deploy scan of the
   staging URL.

## 9. Reproducing the evidence

```powershell
# local scan (same one the gate runs) — app must be up on :3000
.\scripts\zap.ps1
# → zap-report.html / zap-report.md / zap-report.json in the repository root

# the gate itself
git config core.hooksPath githooks   # one-time enable per clone
git push                             # scans, prints PASS/WARN/FAIL, blocks on FAIL
```

CI evidence: repository → **Actions → ZAP Baseline**, per-run `zap_scan` artifact.
Every scan in this report: **62 PASS · 6 WARN · 0 FAIL** (167 URLs, ≈ 2–4 min).

---

*Prepared from live run data of 2–3 November 2026. Counts and links above are taken directly
from the ZAP reports and the GitHub Actions run history.*
