# tofly-ugc-management

[![Frontend CI](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/actions/workflows/frontend.yml/badge.svg?branch=main)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/actions/workflows/frontend.yml)
[![Backend CI](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/actions/workflows/backend.yml/badge.svg?branch=main)](https://github.com/PROPENSI-PPL-Tofly/tofly-ugc-management/actions/workflows/backend.yml)

User-generated content management for Tofly. Monorepo with a Next.js frontend and a Nest.js backend.

## Structure

```
frontend/   Next.js (TypeScript, App Router, Tailwind)
backend/    Nest.js (TypeScript)
```

## Development

```bash
# Frontend
cd frontend && npm install && npm run dev

# Backend
cd backend && npm install && npm run start:dev
```

## CI/CD

Two path-filtered GitHub Actions workflows — `frontend.yml` and `backend.yml` — each lint, test, and build
their app. They run on pushes to `main` and on PRs to `main`, but only when that app's files (or its own
workflow file) change, so an unrelated change never runs both pipelines. Each also has a manual
`workflow_dispatch` deploy job, stubbed until a hosting target is chosen.
