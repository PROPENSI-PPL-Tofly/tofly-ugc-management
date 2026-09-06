# tofly-ugc-management

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
