# CI/CD Documentation

This repository uses 2 GitHub Actions workflows:

- `.github/workflows/backend.yml`
- `.github/workflows/frontend.yml`

Both workflows implement CI (lint, test, coverage gate, build, SonarCloud analysis with a quality
gate) and CD (container image → Artifact Registry → Cloud Run, on push to `main`).

## 1) Workflow Triggers

### Backend (`backend.yml`)

- `push` to `main` when files change in:
  - `backend/**`
  - `supabase/**`
  - `.github/workflows/backend.yml`
- `pull_request` targeting `main` when files change in the same paths
- `workflow_dispatch` (manual; runs `test` only — see §6)

`supabase/**` is included so that a migration-only commit still runs the pipeline and reaches the
hosted database.

### Frontend (`frontend.yml`)

- `push` to `main` when files change in:
  - `frontend/**`
  - `.github/workflows/frontend.yml`
- `pull_request` targeting `main` when files change in the same paths
- `workflow_dispatch` (manual; runs `test` only — see §6)

Pushes to any branch other than `main` trigger nothing. Open a PR to get CI.

## 2) CI Stages

### `test` job (both workflows)

Runs on every trigger. One run per branch at a time; a newer push cancels the superseded run
(`concurrency` scoped to this job only, so it never cancels a deploy).

- Backend:
  - start a Postgres service container — `supabase/postgres:17.6.1.166`, the same image
    `npx supabase start` uses locally, so CI has the same major version, extensions, roles and
    schemas as dev and production
  - setup Node 24
  - `npm ci` at the repo root (Supabase CLI, pinned by the root lockfile) and in `backend/`
  - `npx prisma generate` and `npx prisma validate`
  - lint (`oxlint`)
  - unit tests with coverage (`npm run test:cov`)
  - upload `coverage/lcov.info` as the `backend-coverage` workflow artifact (1-day retention)
    for the `sonar` job
  - apply `supabase/migrations/` to the CI database with `npx supabase db push --db-url …`
    (the same tool and command the production `migrate` job uses)
  - e2e tests against that database (`npm run test:e2e`)
  - build (`nest build`)
  - generate/update coverage badge SVG
- Frontend:
  - setup Node 24
  - `npm ci`
  - lint (`eslint`)
  - unit tests with coverage (`npm run test:cov`)
  - upload `coverage/lcov.info` as the `frontend-coverage` workflow artifact (1-day retention)
    for the `sonar` job
  - build (`next build`, standalone output)
  - generate/update coverage badge SVG

Both apps enforce a **minimum 80% line coverage** in their Vitest config; the `test:cov` step
fails below it.

### `sonar` job (both workflows)

`needs: test`. Runs on every trigger except fork PRs, where it is skipped (not failed) because
`SONAR_TOKEN` is not exposed to forks. Same per-branch `concurrency` pattern as `test`.

- check out the same ref as `test` (`github.head_ref`, `fetch-depth: 0`) so blame, new-code
  detection and `sonar.scm.revision` all refer to the analysed commit
- `npm ci` (backend also `npx prisma generate`) so the TypeScript analyzer has type information
- download the lcov artifact into `<app>/coverage/` — tests are **not** rerun
- `SonarSource/sonarqube-scan-action` with `projectBaseDir: <app>`:
  - identity (`sonar.organization`, `sonar.projectKey`) comes from repo variables (§5)
  - sources, tests, exclusions and the lcov path come from `<app>/sonar-project.properties`
  - `sonar.qualitygate.wait=true`: the job waits for SonarCloud's quality gate and fails if it
    fails
- `pull_request` runs are analysed as pull requests: SonarCloud decorates the PR and posts its
  own `SonarCloud Code Analysis` check. `push` and `workflow_dispatch` runs analyse the `main`
  branch.

One SonarCloud project per app (monorepo mode), so a backend-only change only ever analyses —
and only ever waits on — the backend project.

## 3) CD Stages

All CD jobs run only on `push` to `main` (`if: github.event_name == 'push' && github.ref ==
'refs/heads/main'`). Each uses `cancel-in-progress: false` — a deploy is never interrupted.

### Backend: `test` → `sonar` → `build` → `migrate` → `deploy`

**`build`** (`needs: test, sonar`)

- Authenticate to Google Cloud with Workload Identity Federation (`google-github-actions/auth@v2`)
  — no service-account key is stored anywhere
- `docker build` `backend/Dockerfile`
- Push to Artifact Registry tagged with both `${{ github.sha }}` and `latest`

**`migrate`** (`needs: test, build`)

- `npx supabase link --project-ref …`
- `npx supabase db push` — applies `supabase/migrations/` to the hosted Supabase database
- Runs **after** the image is pushed so a broken Dockerfile can never leave production migrated
  but not deployed; runs **before** `deploy` because the Prisma client is baked into the image at
  build time and must not reach production ahead of its schema

**`deploy`** (`needs: build, migrate`)

- Deploy the SHA-tagged image to Cloud Run with `--no-traffic --tag candidate`; the previous
  revision keeps serving. (A brand-new service has no previous revision and deploys with traffic.)
- Smoke test the candidate at its tag URL: `GET /health` must return 200 (5 attempts, 5 s apart)
- Promote: `gcloud run services update-traffic --to-latest` — only reached if the smoke test passed

Runtime config on the service: `DATABASE_URL` and `DIRECT_URL` mounted from **Secret Manager**
(`--set-secrets`), never as env vars.

### Frontend: `test` → `sonar` → `deploy`

**`deploy`** (`needs: test, sonar`) — build and deploy share one job since there is nothing to
order against.

- Authenticate with Workload Identity Federation
- `docker build` `frontend/Dockerfile`, push tagged with `${{ github.sha }}` and `latest`
- Deploy with `--no-traffic --tag candidate`, `BACKEND_URL` set as a runtime env var
- Smoke test the candidate: `GET /api/health` must return 200 — this walks the whole chain
  (frontend → proxy → backend → database)
- Promote to 100% traffic

### Cloud Run settings (both services)

| Flag | Value |
| --- | --- |
| region | `asia-southeast2` (from `GCP_REGION`) |
| memory / cpu | `512Mi` / `1`, with `--cpu-boost` |
| concurrency | `80` |
| min instances | `CLOUD_RUN_MIN_INSTANCES` (repo variable) |
| max instances | `3` |
| ingress | `--allow-unauthenticated` |

`CLOUD_RUN_MIN_INSTANCES` is a repo variable rather than a literal so it can be changed without a
workflow edit — and so a manual `gcloud run services update` is not silently reverted by the next
deploy. Any value above `0` bills continuously.

## 4) Coverage Badge Update Behavior

Coverage badge updates only run for:

- `push` events on `main`
- internal `pull_request` events targeting `main` (same repository, not fork PR)

For these events, the workflow resolves the target branch dynamically:

- PR: `github.head_ref` (source branch of the PR within this repository)
- Push to `main`: `github.ref_name` (which is `main`)

It then commits and pushes badge changes back to that branch with `[skip ci]` so the badge
commit does not re-trigger the workflow. The push is retried up to 3 times; the step is
`continue-on-error`, so a badge failure never fails the build.

To make this possible, `test` checks out the branch head (`ref: github.head_ref`) rather than
the PR merge ref.

Badge files:

- `.github/badges/backend-coverage.svg`
- `.github/badges/frontend-coverage.svg`

## 5) Required GitHub Configuration

### Secrets

- `SUPABASE_ACCESS_TOKEN` — personal access token, used by `migrate` to link the project
- `SUPABASE_DB_PASSWORD` — hosted database password, used by `supabase db push`
- `SUPABASE_PROJECT_ID` — Supabase project ref
- `SONAR_TOKEN` — SonarCloud token (personal or organization), used by the `sonar` job. If it
  has an expiry, the job starts failing with "Not authorized" when it lapses — rotate it.
- `GITHUB_TOKEN` (provided by Actions; used for the badge commit)

### Variables (`Repository Variables`)

- `SONAR_ORG` — SonarCloud organization key (`propensi-ppl-tofly`)
- `SONAR_BACKEND_PROJECT_KEY` — `PROPENSI-PPL-Tofly_tofly-ugc-management_backend`
- `SONAR_FRONTEND_PROJECT_KEY` — `PROPENSI-PPL-Tofly_tofly-ugc-management_frontend`
- `GCP_PROJECT_ID`
- `GCP_REGION` — `asia-southeast2`
- `GCP_AR_REPO` — Artifact Registry repository name (`tofly`)
- `GCP_WIF_PROVIDER` — `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/github-provider`
- `GCP_DEPLOYER_SA` — `github-deployer@<PROJECT_ID>.iam.gserviceaccount.com`
- `BACKEND_URL` — the backend Cloud Run URL, passed to the frontend as a runtime env var
- `CLOUD_RUN_MIN_INSTANCES` — `0` or `1`

No GCP credential is stored in GitHub. `GCP_WIF_PROVIDER` and `GCP_DEPLOYER_SA` are identifiers;
the trust is established on the GCP side (§8).

## 6) Failure Rules

- If `test` fails: nothing downstream runs.
- If the SonarCloud **quality gate** fails: `sonar` fails and no CD job runs. `test` is
  unaffected — it already passed. Gate rules live in SonarCloud (§9), not in this repo; the 80%
  Vitest threshold in `test:cov` still applies independently.
- `sonar` is skipped on fork PRs. CD jobs only run on push to `main`, so a skipped `sonar` never
  skips a deploy.
- A failed gate blocks **merging** only if branch protection requires the SonarCloud app's
  `SonarCloud Code Analysis` check (§9). Do **not** require the per-workflow `SonarCloud analysis`
  jobs: the workflows are path-filtered, so on a backend-only PR the frontend job never runs and a
  required-but-never-run job leaves the PR stuck at "Expected — waiting for status".
- Backend: if `build` fails, `migrate` and `deploy` do not run — the database is untouched.
- Backend: if `migrate` fails, `deploy` does not run — the already-pushed image is not rolled out.
- If the **smoke test** fails: the `Promote` step does not run. The candidate revision stays at
  0% traffic and the previous revision keeps serving. No rollback is needed.
- `workflow_dispatch` runs `test` only; every CD job additionally requires
  `github.event_name == 'push'`.
- If the badge update `git push` fails: retried 3 times, then skipped without failing the run.
- The coverage gate is enforced by Vitest's `thresholds`, not by the workflow — it fails the
  `test:cov` step directly.

## 7) How to Monitor

- CI/CD runs: GitHub tab `Actions`
- Workflow files:
  - `.github/workflows/backend.yml`
  - `.github/workflows/frontend.yml`
- Deployed services:

  ```bash
  gcloud run services list --region asia-southeast2
  gcloud run revisions list --service backend --region asia-southeast2
  gcloud run services logs read backend --region asia-southeast2 --limit 100
  ```

- Health endpoints:
  - backend: `<backend URL>/health` → `{"db":"ok"}`
  - frontend: `<frontend URL>/api/health` → `{"db":"ok"}` (full chain via the proxy)
- SonarCloud:
  - backend: <https://sonarcloud.io/project/overview?id=PROPENSI-PPL-Tofly_tofly-ugc-management_backend>
  - frontend: <https://sonarcloud.io/project/overview?id=PROPENSI-PPL-Tofly_tofly-ugc-management_frontend>
  - in the `sonar` job log, look for `QUALITY GATE STATUS: PASSED` / `FAILED`

## 8) Google Cloud Setup

The workflows depend on infrastructure created once, by hand (see the deployment plan, Part A).
None of it is managed from this repository.

### HTTPS

Cloud Run terminates TLS and provisions certificates automatically for every `*.run.app` URL.
There is no reverse proxy, no Certbot, and nothing to renew. HTTP requests are redirected to
HTTPS by the platform.

### Workload Identity Federation

How CI gets permission to deploy without a stored key. Four pieces:

| Piece | Purpose |
| --- | --- |
| Workload identity pool `github` | container for external identities |
| Provider `github-provider` | trusts `token.actions.githubusercontent.com`; `--attribute-condition` restricts it to the `PROPENSI-PPL-Tofly` org |
| Service account `github-deployer` | what CI may do: `roles/run.admin`, `roles/artifactregistry.writer`, `roles/iam.serviceAccountUser` on the runtime SAs |
| `roles/iam.workloadIdentityUser` binding | which repo may impersonate the deployer: this repo only |

The deploy jobs need `permissions: id-token: write`; without it, the OIDC token cannot be minted
and auth fails with a 403.

### Runtime service accounts

| Service account | Used by | Extra access |
| --- | --- | --- |
| `run-backend` | Cloud Run `backend` | `roles/secretmanager.secretAccessor` on `DATABASE_URL`, `DIRECT_URL` |
| `run-frontend` | Cloud Run `frontend` | none |

### Secret Manager

| Secret | Value |
| --- | --- |
| `DATABASE_URL` | Supabase **shared pooler, transaction mode** (`:6543`) with `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Supabase **shared pooler, session mode** (`:5432`) |

Both must be shared-pooler hostnames (`*.pooler.supabase.com`): the direct host is IPv6-only and
unreachable from Cloud Run.

### Artifact Registry

- Repository `tofly`, format Docker, region `asia-southeast2`
- Images: `asia-southeast2-docker.pkg.dev/<PROJECT_ID>/tofly/backend` and `…/frontend`
- Cleanup policy: keep 5 most recent versions, delete anything older than 30 days

### Rollback

Every deploy creates a revision and an image tagged with its commit SHA.

```bash
gcloud run revisions list --service backend --region asia-southeast2
gcloud run services update-traffic backend --region asia-southeast2 --to-revisions <revision>=100
```

Rollback restores code, not data — a migration is not undone by routing traffic to an older
revision.

### Troubleshooting

- **Auth fails with 403 at `google-github-actions/auth`:** `id-token: write` missing on the job,
  or `GCP_WIF_PROVIDER` uses the project ID instead of the project **number**
- **`docker push` denied:** deployer SA lacks `artifactregistry.writer`
- **Deploy denied on the runtime SA:** deployer SA lacks `iam.serviceAccountUser` on
  `run-backend` / `run-frontend`
- **Revision fails to start, logs look fine:** app bound to loopback instead of `0.0.0.0`
- **Revision exits at boot:** a secret did not mount — check `--set-secrets` and the runtime SA's
  `secretAccessor` role
- **Smoke test fails on `/api/health` but `/health` passes:** `BACKEND_URL` on the frontend
  service is wrong
- **Everything fails after a quiet week:** Supabase paused the free-tier project after 7 days
  idle — unpause from the dashboard
- **`migrate` cannot connect from CI:** GitHub runners are IPv4-only; pass the session pooler
  explicitly with `supabase db push --db-url "$DIRECT_URL"`
- **Google says "permission denied … (or it may not exist)":** usually a misspelled resource
  name, not IAM — check spelling first

## 9) SonarCloud Setup

Static analysis, coverage and a quality gate on SonarCloud (<https://sonarcloud.io>), one
project per app in **monorepo mode**. Created once, by hand; nothing on the SonarCloud side is
managed from this repository.

### Organization and projects

| Piece | Value |
| --- | --- |
| Organization | `propensi-ppl-tofly` (imported from the GitHub org; installs the SonarCloud GitHub App) |
| Backend project key | `PROPENSI-PPL-Tofly_tofly-ugc-management_backend` |
| Frontend project key | `PROPENSI-PPL-Tofly_tofly-ugc-management_frontend` |
| Analysis method | CI-based (the `sonar` job). Monorepo projects have no Automatic Analysis, so there is no conflict. |
| Quality gate | `Sonar way` (default): on new code ≥ 80% coverage, ≤ 3% duplication, no new issues, security hotspots reviewed |
| New Code | **Reference branch: `main`**. Only selectable after the first analysis — until then use "Number of days". PR analysis is unaffected either way; it always compares against the PR's target branch. |

To recreate: org page → **+** → *Analyze new project* → select the repo → **Set up as a
monorepo** → add the two projects with the keys above. A plain (non-monorepo) import binds the
whole repo to one project and must be deleted before the monorepo import is offered.

### Credentials

- `SONAR_TOKEN` secret — *My Account → Security → Generate token*.
- `SONAR_ORG`, `SONAR_BACKEND_PROJECT_KEY`, `SONAR_FRONTEND_PROJECT_KEY` variables — the values
  above. Identity lives in GitHub variables so a key or org can change without a commit.

### Per-app configuration

`backend/sonar-project.properties` and `frontend/sonar-project.properties` hold everything that
describes the code layout: `sonar.sources`, `sonar.tests`, test inclusion patterns (specs are
colocated in `src/`), `sonar.coverage.exclusions` (mirrors `coverage.exclude` in each
`vitest.config.ts`, so Sonar's percentage matches the badge) and
`sonar.javascript.lcov.reportPaths=coverage/lcov.info`.

They deliberately omit `sonar.organization` and `sonar.projectKey` — the workflow passes those.

### Running the scanner locally

```bash
cd backend            # or frontend
npm run test:cov
npx sonar-scanner \
  -Dsonar.organization=propensi-ppl-tofly \
  -Dsonar.projectKey=PROPENSI-PPL-Tofly_tofly-ugc-management_backend \
  -Dsonar.token=<token>
```

`.scannerwork/` (the scanner's cache) is git-ignored in both apps.

### Branch protection

To make a red quality gate block merging, require the SonarCloud app's **`SonarCloud Code
Analysis`** check on `main` (GitHub → Settings → Branches). The picker only lists checks that have
reported at least once, so this can only be done after the first PR analysis. Confirm on that PR
that the app posts a single check (not one per project) before requiring it; see §6 for why the
per-workflow `SonarCloud analysis` jobs must not be required.

### Troubleshooting

- **`Not authorized` / `Project not found` in the `sonar` log:** `SONAR_TOKEN` expired or
  wrong, or `SONAR_ORG` / a project-key variable does not match SonarCloud
- **Coverage shows 0% on SonarCloud but the badge is fine:** the lcov artifact was not
  downloaded into `<app>/coverage/`, or `projectBaseDir` / `sonar.javascript.lcov.reportPaths`
  is wrong
- **PR not decorated, no SonarCloud check:** the SonarCloud GitHub App lacks access to the repo,
  or it is a fork PR (the job is skipped)
- **`Could not find ref main` / shallow-clone warning:** `fetch-depth: 0` was removed from the
  `sonar` checkout
- **Analysis attached to the wrong commit:** `-Dsonar.scm.revision=…` was dropped — on PRs the
  checkout is the branch head while `GITHUB_SHA` is the merge commit
- **PR stuck at "Expected — waiting for status":** a per-workflow `SonarCloud analysis` job was
  made a required check; require the app check instead (§6)
