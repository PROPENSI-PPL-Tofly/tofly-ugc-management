# CI/CD Documentation

This repository uses 2 GitHub Actions workflows:

- `.github/workflows/backend.yml`
- `.github/workflows/frontend.yml`

Both workflows implement CI (lint, test, coverage, Sonar, build) and CD (container image →
Artifact Registry → Cloud Run, on push to `main`).

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

Backend has 5 jobs: `test`, `sonar`, `build`, `migrate`, `deploy`. Frontend has 3: `test`,
`sonar`, `deploy`.

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
  - upload coverage artifact (`lcov.info`)
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
  - upload coverage artifact (`lcov.info`)
  - build (`next build`, standalone output)
  - generate/update coverage badge SVG

Both apps enforce a **minimum 80% line coverage** in their Vitest config; the `test:cov` step
fails below it.

### `sonar` job (both workflows)

- Runs after `test` (`needs: test`). Skipped on fork PRs (no access to `SONAR_TOKEN`).
- One SonarCloud project per app (monorepo mode), so each workflow only analyses its own app.
- Checks out the same ref as `test` with full history, installs dependencies (backend also
  `npx prisma generate`) so the analyzer has type information.
- Downloads the coverage artifact from `test` — tests are not rerun.
- Uses SonarCloud scan action (`SonarSource/sonarqube-scan-action`) with `projectBaseDir` set to
  the app. Organization and project key come from repo variables (§5); sources, tests,
  exclusions and the lcov path from `<app>/sonar-project.properties`.
- Waits for quality gate (`sonar.qualitygate.wait=true`).
- PRs are analysed as pull requests (SonarCloud decorates the PR); pushes analyse `main`.

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

- `npx supabase db push --project-ref … --password …` — applies `supabase/migrations/` to the
  hosted Supabase database. Targets the project directly rather than `supabase link` first:
  `link` fetches the legacy API keys and the platform rejects that call even for owners
  (supabase/cli#6392)
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

- `SUPABASE_ACCESS_TOKEN` — personal access token, used by `migrate` to resolve the project
- `SUPABASE_DB_PASSWORD` — hosted database password, used by `supabase db push`
- `SUPABASE_PROJECT_ID` — Supabase project ref
- `SONAR_TOKEN` — SonarCloud token, used by the `sonar` job
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

- If `test` fails: `sonar` and every CD job do not run.
- If the `sonar` quality gate fails: no CD job runs. Gate rules are configured in SonarCloud, not
  in this repo; the 80% Vitest threshold still applies independently.
- A failed gate blocks merging only if branch protection requires the SonarCloud check. Require
  SonarCloud's own `SonarCloud Code Analysis` check, not the per-workflow `sonar` jobs — the
  workflows are path-filtered, so a required job that never runs leaves the PR stuck at
  "Expected".
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
