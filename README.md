# tofly-ugc-management

[![Frontend coverage](https://codecov.io/gh/PROPENSI-PPL-Tofly/tofly-ugc-management/branch/main/graph/badge.svg?flag=frontend)](https://app.codecov.io/gh/PROPENSI-PPL-Tofly/tofly-ugc-management?flags%5B0%5D=frontend)
[![Backend coverage](https://codecov.io/gh/PROPENSI-PPL-Tofly/tofly-ugc-management/branch/main/graph/badge.svg?flag=backend)](https://app.codecov.io/gh/PROPENSI-PPL-Tofly/tofly-ugc-management?flags%5B0%5D=backend)

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

GitHub Actions (`.github/workflows/ci.yml`) lints, builds, and tests both apps on push and PR.
A manual deploy job is stubbed and left disabled until a hosting target is chosen.
