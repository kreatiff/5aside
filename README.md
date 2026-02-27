# 5-a-Side Attendance and Payments

Monorepo for an admin-only attendance/payment reconciliation app.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Fastify + TypeScript
- Database: PostgreSQL
- Deploy: Docker Compose

## Workspace Layout

- `apps/api` - Fastify API
- `apps/web` - React admin app
- `packages/contracts` - shared Zod schemas and types
- `packages/recon` - normalization and matching logic
- `infra` - Docker and backup scripts
- `scripts/migration` - migration helpers for historical data

## Quick Start (Docker)

1. Copy `.env.example` to `.env` and update secrets.
2. Run `docker compose up --build`.
3. API is exposed on `http://localhost:4000`, web on `http://localhost:4000` (served by API runtime image).
