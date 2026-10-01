# CI/CD Documentation

This repository uses 2 GitHub Actions workflows:

- `.github/workflows/backend.yml`
- `.github/workflows/frontend.yml`

Both workflows implement CI (lint, test, coverage, Sonar, build) and CD (container image →
Artifact Registry → Cloud Run) for two environments:

| Environment | Branch | Backend service | Frontend service | Database (Cloud SQL `tofly-pg`) |
| --- | --- | --- | --- | --- |
| `staging` | `staging` | `backend` | `frontend` | `tofly_staging` |
| `production` | `main` | `backend-prod` | `frontend-prod` | `tofly` |

Work flows `feat/pbi-*` → `staging` → `main`.

## 1) Workflow Triggers

### Backend (`backend.yml`)

- `push` to `main`, `staging` or a `feat/pbi-*` branch when files change in:
  - `backend/**` (this includes the migrations in `backend/prisma/migrations/`)
  - `compose.yaml`
  - `.github/workflows/backend.yml`
- `pull_request` targeting `main`, `staging` or a `feat/pbi-*` branch when files change in the same
  paths
- `workflow_dispatch` (manual; on `main` or `staging` it also deploys — see §3)

A migration-only commit changes `backend/**`, so it still runs the pipeline and reaches the
environment's database.

### Frontend (`frontend.yml`)

- `push` to `main`, `staging` or a `feat/pbi-*` branch when files change in:
  - `frontend/**`
  - `.github/workflows/frontend.yml`
- `pull_request` targeting `main`, `staging` or a `feat/pbi-*` branch when files change in the same
  paths
- `workflow_dispatch` (manual; on `main` or `staging` it also deploys — see §3)

`feat/pbi-*` are the per-PBI integration branches: subtask PRs land on one of them before the
whole PBI goes to `staging` as a single PR, and the pattern means a new PBI branch gets CI without
editing these files. `*` does not cross `/`, so a branch nesting another segment
(`feat/pbi-2/foo`) would need `feat/pbi-**`.

Pushes to any other branch trigger nothing. Open a PR to get CI. Only `main` and `staging`
deploy (§3).

## 2) CI Stages

Backend has 5 jobs: `test`, `sonar`, `build`, `migrate`, `deploy`. Frontend has 3: `test`,
`sonar`, `deploy`.

### `test` job (both workflows)

Runs on every trigger. One run per branch at a time; a newer push cancels the superseded run
(`concurrency` scoped to this job only, so it never cancels a deploy).

- Backend:
  - start a Postgres service container — plain `postgres:17`, the same major as Cloud SQL and the
    local `compose.yaml`. It has none of the roles a managed platform adds, so a migration that
    leans on one fails here first
  - setup Node 24, `npm ci` in `backend/`
  - `npx prisma generate` and `npx prisma validate`
  - lint (`oxlint`)
  - unit tests with coverage (`npm run test:cov`)
  - upload coverage artifact (`lcov.info`)
  - prepare the database the way `migrate` prepares Cloud SQL: `prisma/ops/bootstrap-roles.sql`,
    `npx prisma migrate deploy` as `postgres`, then `prisma/ops/hand-off-ownership.sql` to the CI app
    role `tofly_app`
  - e2e tests against that database (`npm run test:e2e`), connected as `tofly_app` — the table
    owner, as the app is in staging and production
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
- Runs on same-repo PRs, on `push` to `main`, and on `workflow_dispatch` other than on `staging` —
  not on pushes to `staging` or `feat/pbi-*`. A push to a non-`main` branch asks SonarCloud for a
  *branch* analysis, which it refuses with "Not authorized or project not found", so those runs
  would fail for a reason no change in this repo can fix. Code reaches `staging` only through a PR,
  which was analysed.
- PRs are analysed as pull requests (SonarCloud decorates the PR); pushes to `main` analyse `main`.
- Because the integration branches are never analysed as branches, SonarCloud falls back to the
  main branch as the new-code reference for PRs targeting them: a PR's quality gate covers the
  whole diff from `main`, not just that PR's own commits.

## 3) CD Stages

CD jobs run on a `push` or `workflow_dispatch` to `main` (environment `production`) or `staging`
(environment `staging`). The manual run deploys a branch whose latest push changed no watched path
(for example the first push of `staging`). Each CD job uses `cancel-in-progress: false` — a deploy
is never interrupted — with one concurrency group per branch, so staging and production deploy
independently.

Every backend CD job and the frontend `deploy` carry `always()` in their `if`: `sonar` is skipped
on `staging`, and a skipped job anywhere up the chain would otherwise skip every job after it.
`migrate` and `deploy` therefore check `build`'s and `migrate`'s results explicitly. They still require `test` to pass,
and production still requires a passed `sonar` gate.

Which service, service account, database and secrets a job uses comes from the GitHub Environment
it runs in (`environment: production` on `main`, `staging` on `staging`; §5). Each environment
only accepts deployments from its own branch.

### Backend: `test` → `sonar` → `build` → `migrate` → `deploy`

**`build`** (`needs: test, sonar`)

- Authenticate to Google Cloud with Workload Identity Federation (`google-github-actions/auth@v2`)
  — no service-account key is stored anywhere
- `docker build` `backend/Dockerfile`
- Push to Artifact Registry tagged with both `${{ github.sha }}` and the branch name (`main` or
  `staging`)

**`migrate`** (`needs: build`, environment-scoped)

- Authenticate with Workload Identity Federation, then start the **Cloud SQL Auth Proxy**
  (pinned release) on the runner at `127.0.0.1:5432`. The instance accepts no other connection —
  it has no authorized networks — and the proxy encrypts and authorizes the hop itself
- `prisma/ops/bootstrap-roles.sql` — creates the `anon` and `authenticated` roles the early
  migrations name, closed, if they are missing (idempotent)
- `npx prisma migrate deploy` as `postgres` (`MIGRATOR_DB_URL`) — applies
  `backend/prisma/migrations/` with the Prisma CLI pinned by `backend/package-lock.json`
- `prisma/ops/hand-off-ownership.sql` with `app_role=$APP_DB_ROLE` — gives every table, sequence
  and type in `public` to the environment's app role. Every table has row level security with no
  policy, which only the owner passes, so the app must own them. `_prisma_migrations` stays with
  `postgres`
- `prisma/ops/seed-admins.sql` with the environment's `ADMIN_EMAILS` — adds or promotes the team's
  admin accounts (skipped if the secret is unset)
- Runs **after** the image is pushed so a broken Dockerfile can never leave an environment
  migrated but not deployed; runs **before** `deploy` because the Prisma client is baked into the
  image at build time and must not reach an environment ahead of its schema

**`deploy`** (`needs: build, migrate`, environment-scoped)

- Deploy the SHA-tagged image to the environment's Cloud Run service with
  `--no-traffic --tag candidate`; the previous revision keeps serving. (A brand-new service has no
  previous revision and deploys with traffic.)
- Smoke test the candidate at its tag URL: `GET /health` must return 200 (5 attempts, 5 s apart)
- Promote: `gcloud run services update-traffic --to-latest` — only reached if the smoke test passed

Runtime config on the service: `--add-cloudsql-instances` mounts the instance's unix socket;
`DATABASE_URL` and `DIRECT_URL` (the same URL, nothing pools in between) and
`GOOGLE_CLIENT_SECRET` come from **Secret Manager** (`--set-secrets`), never env vars.
`GOOGLE_CLIENT_ID` and `GOOGLE_REDIRECT_URI` are plain env.

### Frontend: `test` → `sonar` → `deploy`

**`deploy`** (`needs: test, sonar`, environment-scoped) — build and deploy share one job since
there is nothing to order against.

- Authenticate with Workload Identity Federation
- `docker build` `frontend/Dockerfile`, push tagged with `${{ github.sha }}` and the branch name
- Deploy to the environment's service with `--no-traffic --tag candidate`, `BACKEND_URL` set as a
  runtime env var
- Smoke test the candidate: `GET /api/health` must return 200 — this walks the whole chain
  (frontend → proxy → backend → database)
- Promote to 100% traffic

### Cloud Run settings (all services)

| Flag | Value |
| --- | --- |
| region | `asia-southeast2` (from `GCP_REGION`) |
| memory / cpu | `512Mi` / `1`, with `--cpu-boost` |
| concurrency | `80` |
| min instances | `CLOUD_RUN_MIN_INSTANCES` (environment variable) |
| max instances | `3` |
| ingress | `--allow-unauthenticated` |

`CLOUD_RUN_MIN_INSTANCES` is a variable rather than a literal so it can be changed without a
workflow edit — and so a manual `gcloud run services update` is not silently reverted by the next
deploy. Any value above `0` bills continuously.

## 4) Coverage Badge Update Behavior

Coverage badge updates only run for:

- `push` events on `main`, and nothing else

The badge is generated on every run, so a broken `scripts/coverage-badge.mjs` fails on the PR that
breaks it rather than first appearing on `main`; only the commit step is restricted. Keeping the
commit on `main` alone means the SVG in the README always describes `main`, and contributors'
branches never receive an automated badge commit mid-review.

It commits and pushes badge changes back to `main` with `[skip ci]` so the badge
commit does not re-trigger the workflow. The push is retried up to 3 times; the step is
`continue-on-error`, so a badge failure never fails the build.

`test` checks out the branch head (`ref: github.head_ref`) rather than the PR merge ref. The badge
commit no longer depends on that, but `sonar` does — it needs the same ref for the lcov paths and
`sonar.scm.revision` to line up. `permissions: contents: write` on `test` likewise stays, because
job permissions cannot be made conditional on the event.

Badge files:

- `.github/badges/backend-coverage.svg`
- `.github/badges/frontend-coverage.svg`

## 5) Required GitHub Configuration

### Repository secrets

- `SONAR_TOKEN` — SonarCloud token, used by the `sonar` job
- `GITHUB_TOKEN` (provided by Actions; used for the badge commit)

### Repository variables

- `SONAR_ORG` — SonarCloud organization key (`propensi-ppl-tofly`)
- `SONAR_BACKEND_PROJECT_KEY` — `PROPENSI-PPL-Tofly_tofly-ugc-management_backend`
- `SONAR_FRONTEND_PROJECT_KEY` — `PROPENSI-PPL-Tofly_tofly-ugc-management_frontend`
- `GCP_PROJECT_ID`
- `GCP_REGION` — `asia-southeast2`
- `GCP_AR_REPO` — Artifact Registry repository name (`tofly`)
- `GCP_WIF_PROVIDER` — `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/github-provider`
- `GCP_DEPLOYER_SA` — `github-deployer@<PROJECT_ID>.iam.gserviceaccount.com`
- `CLOUDSQL_INSTANCE` — `<PROJECT_ID>:asia-southeast2:tofly-pg`
- `GOOGLE_CLIENT_ID` — the Web OAuth client both environments share

### Environments

Two environments, each restricted to its branch (Settings → Environments → Deployment branches).
An environment variable overrides a repository variable of the same name.

| Variable | `production` | `staging` |
| --- | --- | --- |
| `BACKEND_SERVICE` | `backend-prod` | `backend` |
| `FRONTEND_SERVICE` | `frontend-prod` | `frontend` |
| `RUN_BACKEND_SA` | `run-backend-prod@<PROJECT_ID>.iam.gserviceaccount.com` | `run-backend@…` |
| `RUN_FRONTEND_SA` | `run-frontend-prod@…` | `run-frontend@…` |
| `DB_SECRET` | `DB_URL_PROD` | `DB_URL_STAGING` |
| `APP_DB_ROLE` | `tofly_prod` | `tofly_staging` |
| `BACKEND_URL` | the `backend-prod` URL | the `backend` URL |
| `GOOGLE_REDIRECT_URI` | `<frontend-prod URL>/api/auth/google/callback` | `<frontend URL>/api/auth/google/callback` |
| `CLOUD_RUN_MIN_INSTANCES` | `0` or `1` | `0` or `1` |

| Secret | Value |
| --- | --- |
| `MIGRATOR_DB_URL` | `postgresql://postgres:<pw>@127.0.0.1:5432/<tofly or tofly_staging>?sslmode=disable` — through the Auth Proxy the `migrate` job starts |
| `ADMIN_EMAILS` | comma-separated admin addresses for that environment (the repo is public; they live only here) |

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
- `workflow_dispatch` on any branch other than `main` or `staging` runs `test` (and `sonar`) only.
- If the badge update `git push` fails: retried 3 times, then skipped without failing the run.
- The coverage gate is enforced by Vitest's `thresholds`, not by the workflow — it fails the
  `test:cov` step directly.

## 7) How to Monitor

- CI/CD runs: GitHub tab `Actions`; deployments per environment under `Environments`
- Workflow files:
  - `.github/workflows/backend.yml`
  - `.github/workflows/frontend.yml`
- Deployed services:

  ```bash
  gcloud run services list --region asia-southeast2
  gcloud run revisions list --service backend-prod --region asia-southeast2
  gcloud run services logs read backend-prod --region asia-southeast2 --limit 100
  gcloud sql instances describe tofly-pg
  ```

- Health endpoints:
  - backend: `<backend URL>/health` → `{"db":"ok"}`
  - frontend: `<frontend URL>/api/health` → `{"db":"ok"}` (full chain via the proxy)
- SonarCloud:
  - backend: <https://sonarcloud.io/project/overview?id=PROPENSI-PPL-Tofly_tofly-ugc-management_backend>
  - frontend: <https://sonarcloud.io/project/overview?id=PROPENSI-PPL-Tofly_tofly-ugc-management_frontend>

## 8) Google Cloud Setup

The workflows depend on infrastructure created once, by hand. None of it is managed from this
repository.

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
| Service account `github-deployer` | what CI may do: `roles/run.admin`, `roles/artifactregistry.writer`, `roles/cloudsql.client` (the `migrate` proxy), `roles/iam.serviceAccountUser` on the four runtime SAs |
| `roles/iam.workloadIdentityUser` binding | which repo may impersonate the deployer: this repo only |

The deploy jobs need `permissions: id-token: write`; without it, the OIDC token cannot be minted
and auth fails with a 403.

### Cloud SQL

- Instance `tofly-pg`: Postgres 17, `asia-southeast2`, automated daily backups, public IP with
  **no authorized networks** — only the Cloud Run connector and the Auth Proxy, both authorized by
  IAM (`roles/cloudsql.client`), can reach it
- Databases `tofly` (production) and `tofly_staging` (staging)
- Roles:

| Role | Login | Purpose |
| --- | --- | --- |
| `postgres` | yes | runs migrations (`MIGRATOR_DB_URL`); member of both app roles so it can keep altering their tables |
| `tofly_prod` | yes | production app; owns the tables in `tofly`; `CONNECT` on `tofly` only |
| `tofly_staging` | yes | staging app; owns the tables in `tofly_staging`; `CONNECT` on `tofly_staging` only |
| `anon`, `authenticated` | no | exist only because the early migrations revoke from them; hold nothing |

`CONNECT` is revoked from `PUBLIC` on both databases, so one environment's credentials never reach
the other's data. The app roles are created with SQL, not `gcloud sql users create`, which would
make them members of `cloudsqlsuperuser`.

### Runtime service accounts

| Service account | Used by | Extra access |
| --- | --- | --- |
| `run-backend` | `backend` (staging) | `roles/cloudsql.client`; `secretAccessor` on `DB_URL_STAGING`, `GOOGLE_CLIENT_SECRET` |
| `run-frontend` | `frontend` (staging) | none |
| `run-backend-prod` | `backend-prod` | `roles/cloudsql.client`; `secretAccessor` on `DB_URL_PROD`, `GOOGLE_CLIENT_SECRET` |
| `run-frontend-prod` | `frontend-prod` | none |

### Secret Manager

| Secret | Value |
| --- | --- |
| `DB_URL_PROD` | `postgresql://tofly_prod:<pw>@localhost/tofly?host=/cloudsql/<PROJECT_ID>:asia-southeast2:tofly-pg&connection_limit=5` |
| `DB_URL_STAGING` | the same for `tofly_staging` |
| `GOOGLE_CLIENT_SECRET` | the Web OAuth client secret |
| `CLOUDSQL_POSTGRES_PASSWORD`, `CLOUDSQL_TOFLY_PROD_PASSWORD`, `CLOUDSQL_TOFLY_STAGING_PASSWORD` | the role passwords the URLs above are built from; no runtime account can read them |

`connection_limit=5` keeps 3 instances × 2 environments well under the instance's connection cap.

### Artifact Registry

- Repository `tofly`, format Docker, region `asia-southeast2`
- Images: `asia-southeast2-docker.pkg.dev/<PROJECT_ID>/tofly/backend` and `…/frontend`, shared by
  both environments (tagged by SHA and branch)
- Cleanup policy: keep 5 most recent versions, delete anything older than 30 days

### Connecting to Cloud SQL by hand

```bash
cloud-sql-proxy --gcloud-auth --port 55432 <PROJECT_ID>:asia-southeast2:tofly-pg
psql "host=127.0.0.1 port=55432 user=postgres dbname=tofly_staging sslmode=disable"
```

The password comes from `gcloud secrets versions access latest --secret CLOUDSQL_POSTGRES_PASSWORD`.

### Rollback

Every deploy creates a revision and an image tagged with its commit SHA.

```bash
gcloud run revisions list --service backend-prod --region asia-southeast2
gcloud run services update-traffic backend-prod --region asia-southeast2 --to-revisions <revision>=100
```

Rollback restores code, not data — a migration is not undone by routing traffic to an older
revision. Data is restored from a Cloud SQL backup (`gcloud sql backups list --instance tofly-pg`).

### Troubleshooting

- **Auth fails with 403 at `google-github-actions/auth`:** `id-token: write` missing on the job,
  or `GCP_WIF_PROVIDER` uses the project ID instead of the project **number**
- **`docker push` denied:** deployer SA lacks `artifactregistry.writer`
- **Deploy denied on the runtime SA:** deployer SA lacks `iam.serviceAccountUser` on that SA
- **Job waits for or rejects the environment:** the branch is not allowed under the environment's
  deployment branches
- **`migrate` says the proxy did not come up:** deployer SA lacks `roles/cloudsql.client`, or
  `CLOUDSQL_INSTANCE` is misspelled — the step prints the proxy's log
- **`permission denied` running a migration:** `postgres` is not a member of the app role
  (`grant <app_role> to postgres`); on Cloud SQL `postgres` is not a superuser
- **The app gets empty results or `permission denied` on a table:** the hand-off did not run, so
  `postgres` still owns it and row level security hides every row from the app role
- **Revision fails to start, logs look fine:** app bound to loopback instead of `0.0.0.0`
- **Revision exits at boot:** a secret did not mount — check `--set-secrets`, the runtime SA's
  `secretAccessor` role, and `roles/cloudsql.client`
- **Smoke test fails on `/api/health` but `/health` passes:** `BACKEND_URL` on the frontend
  service is wrong
- **Google sign-in fails with `redirect_uri_mismatch`:** the environment's `GOOGLE_REDIRECT_URI`
  is not registered on the OAuth client
- **Google says "permission denied … (or it may not exist)":** usually a misspelled resource
  name, not IAM — check spelling first
