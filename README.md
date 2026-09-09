# tofly-ugc-management

[![Frontend CI](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/actions/workflows/frontend.yml/badge.svg?branch=main)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/actions/workflows/frontend.yml)
[![Backend CI](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/actions/workflows/backend.yml/badge.svg?branch=main)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/actions/workflows/backend.yml)
![Frontend coverage](./.github/badges/frontend-coverage.svg)
![Backend coverage](./.github/badges/backend-coverage.svg)

User-generated content management for Tofly. Monorepo with a Next.js frontend and a Nest.js backend.

## Structure

```
frontend/   Next.js (TypeScript, App Router, Tailwind)
backend/    Nest.js (TypeScript, ESM) — Postgres via Prisma
supabase/   Local Supabase stack config (run by the Supabase CLI)
```

Apps are independent folders (not a workspace); each has its own `package.json` and lockfile.
The repo-root `package.json` only holds the Supabase CLI dev dependency.

## Prerequisites

- Node.js 24 — both CI workflows and both Dockerfiles pin 24; an older major
  works locally right up until it skews against CI
- npm
- Docker Desktop, running — the local Supabase stack runs in Docker
- No global Supabase CLI needed — it's a dev dependency, invoked via `npx supabase`

On Windows, run the commands below in **Git Bash**. Windows PowerShell 5.1 does not parse `&&`;
substitute `;` if you insist on staying in PowerShell.

None of this needs a Google Cloud or hosted Supabase account. Deployment infrastructure is set
up once by a maintainer; contributors only need what is on this list.

## First-time setup

The backend connects to Postgres from a local Supabase stack. The Supabase CLI manages its own
Docker containers, so there is no hand-written compose file.

1. Install dependencies (repo root and each app):

```
npm install
cd backend
npm install
cd ../frontend
npm install
```

2. Start the local Supabase stack (from the repo root). This also applies every migration and
   seed to the fresh database, so there is no reset to run afterwards:

```
npx supabase start
```

3. Create the backend env file (defaults already match the local stack):

```
cd backend
cp .env.example .env
```

4. Create the frontend env file:

```
cd ../frontend
cp .env.example .env.local
```

5. Generate the Prisma client:

```
cd ../backend
npx prisma generate
```

Ports: **frontend 3000, backend 3001**, Supabase API `54321`, Postgres `54322`, Studio `54323`.
The frontend proxies `/api/*` to the backend, so in the browser you only ever visit port 3000 —
you never type the backend's port. Open Studio in a browser to inspect the database.

## After you pull

The everyday routine, from the repo root:

```
npx supabase db reset          # replay all migrations onto your local DB
cd backend && npx prisma generate
```

`db reset` **wipes your local data** and replays from scratch, which is exactly what makes it
reliable. If you have local test data worth keeping, `npx supabase migration up` applies only
what is missing and leaves your rows alone — and anything you want to survive a reset belongs
in `supabase/seed.sql`.

Also run `npm install` in an app folder whenever its `package.json` changed in the diff.

**`npx prisma db pull` is not part of this routine.** The migration's author already ran it and
committed the updated `schema.prisma`; you only regenerate from what they committed. Running it
yourself is how `schema.prisma` ends up dirty in `git status` for no reason.

## Changing the database schema

Supabase migrations own the schema. Prisma reads the result — it never owns it.

```
npx supabase migration new <name>     # creates supabase/migrations/<timestamp>_<name>.sql
# write the SQL
npx supabase db reset                 # apply it locally and confirm it replays cleanly
cd backend && npx prisma db pull && npx prisma generate
```

Commit the migration file **and** the updated `schema.prisma` in the same PR. Then two rules:

- **Never edit a merged migration.** The hosted database has already applied it and will not
  re-run it, but a fresh clone will — and now two databases disagree. Add a new migration.
- **Review migrations harder than code.** `DROP COLUMN` deletes real production data on merge,
  with no undo.

And one thing nobody does: **nobody runs `supabase db push` against the hosted database.** CI
does it on merge to `main`, which is what stops production drifting from the branch.

## Development

Assumes the setup above is done.

```
# Frontend
cd frontend
npm run dev

# Backend
cd backend
npm run start:dev
```

Verify the backend's database connection:

```
curl http://localhost:3001/health
```

Expected response:

```
{"db":"ok"}
```

Or open <http://localhost:3000/health> in a browser, which walks the whole chain instead: the
page fetches `/api/health` on the frontend, which proxies to the backend, which queries Postgres.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Backend errors about a table that doesn't exist | `npx supabase db reset` — you skipped it after a pull |
| TypeScript says a model isn't on `PrismaClient` | `npx prisma generate` in `backend/` |
| `supabase start` fails | Docker Desktop isn't running |
| Frontend `/api/*` returns 502 | the backend isn't running, or `BACKEND_URL` in `frontend/.env.local` is wrong |

## Testing & Coverage

Both apps use Vitest with V8 coverage.

```
# Frontend
cd frontend
npm run test        # unit tests
npm run test:cov    # tests + coverage

# Backend
cd backend
npm run test
npm run test:cov
```

Coverage reports are written to each app's `coverage/` folder (console summary, `lcov.info`, and
`coverage-summary.json`). CI enforces a minimum **80% line coverage** and fails the build below it. The
coverage badges at the top are generated by CI from `coverage-summary.json` and committed to
`.github/badges/`.

## CI/CD

Two path-filtered GitHub Actions workflows — `frontend.yml` and `backend.yml` — each lint, test (with an
enforced 80% line-coverage gate), and build their app. They run on pushes to `main` and on PRs to `main`,
but only when that app's files (or its own workflow file) change, so an unrelated change never runs both
pipelines. Each run regenerates its coverage badge and commits it back — on pushes to `main`, and on
internal PRs to the PR's own branch (fork PRs are skipped).

On merge to `main`, both apps build a container image, push it to Artifact Registry, and roll it out to
Cloud Run. `backend.yml` runs a `migrate` job first, applying Supabase migrations to the hosted database;
`deploy` needs it, so a failed migration blocks the rollout. Migrations must land before the new revision
serves, because the Dockerfile bakes the generated Prisma client into the image at build time.

CI authenticates to Google Cloud with **Workload Identity Federation**: GitHub mints a short-lived OIDC
token that GCP exchanges for credentials. There is no service-account key anywhere in this repo.

The old **GitHub Pages** site is a frozen snapshot from before the Cloud Run migration. No workflow
deploys to it any more and it will be switched off; the Cloud Run URLs below are the app.

## Deployment

Both services run on **Cloud Run** in `asia-southeast2` (Jakarta), against a hosted Supabase project in
Singapore. Get the live URLs with:

```
gcloud run services list --region asia-southeast2 --format='table(metadata.name,status.url)'
```

Where each piece of configuration lives:

| Value | Home | Why |
| --- | --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | GCP **Secret Manager** | env vars are readable in the Cloud Run console and in deploy logs |
| `BACKEND_URL` | Cloud Run env var on the frontend | runtime value, so the URL can change without rebuilding the image |
| GCP project/region/WIF identifiers | GitHub repo **variables** | identifiers, not credentials |
| Supabase token, DB password, project ref | GitHub repo **secrets** | real credentials |
| `CLOUD_RUN_MIN_INSTANCES` | GitHub repo **variable** | a knob; hard-coding it means every manual `gcloud run services update` gets reverted by the next deploy |

Rollback — images are tagged with their commit SHA, so this pins traffic to a known-good revision:

```
gcloud run services update-traffic <service> --region asia-southeast2 --to-revisions <revision>=100
```

**Free-tier footgun: Supabase pauses a project after 7 days of inactivity.** Check the dashboard and
unpause before a demo; a paused database takes the whole site down, not just one page.
