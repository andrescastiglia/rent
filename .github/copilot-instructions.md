# Copilot Instructions

## Project Overview

Real estate management system (sistema de gestión inmobiliaria) with four sub-projects:

- **`backend/`** — NestJS REST API, TypeORM + PostgreSQL
- **`frontend/`** — Next.js (App Router) with next-intl
- **`mobile/`** — React Native + Expo
- **`batch/`** — Node.js CLI for background/scheduled jobs
- **`migrations/`** — Plain SQL migration files, applied via `run-migrations.sh`

Local infrastructure (PostgreSQL, Redis, RabbitMQ) is managed via Docker Compose from the repo root.

---

## Commands

### Local Infrastructure

```bash
make setup          # First-time setup: creates .env, starts services, verifies connections
make up             # Start Docker services
make down           # Stop services
make healthcheck    # Verify all services are healthy
make db-migrate     # Run pending SQL migrations
make db-shell       # Open psql shell
make info           # Print connection info
```

### Backend (`cd backend`)

```bash
npm run start:dev       # Dev server with watch
npm run test            # All unit tests
npm run test:e2e        # End-to-end tests
npm run test:cov        # Coverage report
npm run lint            # ESLint (auto-fix)
npm run type-check      # tsc --noEmit
npm run seed            # Seed database with initial data

# Run a single test file or pattern:
npx jest leases.service
npx jest --testPathPattern="auth"
```

### Frontend (`cd frontend`)

```bash
npm run dev             # Dev server
npm test                # Unit tests (Jest)
npm run test:e2e        # Playwright E2E (uses MOCK_MODE=true)
npm run test:e2e:real   # Playwright E2E against real backend
npm run lint
npm run type-check

# Single test:
npx jest PaymentList
```

### Mobile (`cd mobile`)

```bash
npm test                # Jest unit tests
npm run test:cov
npm run lint
npm run type-check

# E2E (Detox, Android emulator):
npm run e2e:android

# Single test:
npx jest -t "renders lease card"
```

### Batch (`cd batch`)

```bash
npm run dev -- lease-renewal-alerts --dry-run   # Dry-run
npm run dev -- lease-renewal-alerts             # Execute
npm test
npm run type-check
```

---

## Architecture

### Multi-tenancy

Every resource is scoped to a `companyId`. The `companyId` comes from the authenticated user's JWT payload and is applied in service methods. Never filter or mutate data without a `companyId` check.

### Backend Module Structure

Each domain (e.g. `leases`, `properties`, `payments`) follows this layout:

```
src/<module>/
  <module>.controller.ts        # REST endpoints, guarded, role-checked
  <module>.controller.spec.ts
  <module>.service.ts           # Business logic, uses repositories
  <module>.service.spec.ts
  <module>.module.ts
  dto/                          # Input validation (class-validator)
  entities/                     # TypeORM entities
```

### Authentication & Authorization

- All routes are protected by `@UseGuards(AuthGuard('jwt'))` by default (applied globally).
- Use `@Public()` on endpoints that don't require auth.
- Use `@Roles(UserRole.ADMIN, UserRole.STAFF)` to restrict by role.
- Roles: `admin`, `owner`, `tenant`, `staff`, `buyer`.
- The JWT payload exposes `{ id, companyId, role, email, phone }` via `@Request() req`.

### TypeORM Entities

- Primary keys are UUIDs: `@PrimaryGeneratedColumn('uuid')`.
- Soft deletes via `@DeleteDateColumn()` (`deleted_at`). Use `withDeleted()` explicitly when you need deleted records.
- All entities include `created_at` and `updated_at`.
- Entity files live in `src/<module>/entities/<name>.entity.ts`.
- **`TYPEORM_SYNC=true`** auto-creates tables in dev. Never enable in production — use SQL migrations instead.

### SQL Migrations

Files in `migrations/` are sequential: `{NNN}_{snake_case_description}.sql`.

- Never modify existing migration files; always add a new one.
- Each file is tracked in `schema_migrations` to prevent re-execution.
- Trigger `functions.update_updated_at_column()` for `updated_at` maintenance.
- Run via `make db-migrate` or `./migrations/run-migrations.sh`.

### Frontend Routing

- All user-facing routes live under `src/app/[locale]/...` (locale-aware App Router).
- Supported locales: `es` (default), `pt`, `en`. Config in `src/config/locales.ts`.
- Translation keys live in `frontend/messages/{locale}.json`.
- Use `useTranslations()` (server/client) or `getTranslations()` (server async) from next-intl.
- Path alias `@/` maps to `src/`.

### Frontend E2E (Playwright)

- `NEXT_PUBLIC_MOCK_MODE=true` enables API mocking; used by default in `npm run test:e2e`.
- Use `npm run test:e2e:real` only when a running backend is available.

### Observability (optional, via env vars)

| Concern | Variable(s) |
|---|---|
| Prometheus metrics | Backend: `GET /metrics`, Frontend: `POST /frontend-metrics` |
| Tracing (OTLP) | `OTEL_EXPORTER_OTLP_*` (backend/batch), `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_*` (frontend) |
| Profiling (Pyroscope) | `PYROSCOPE_SERVER_ADDRESS`, `PYROSCOPE_*` |
| Batch metrics push | `PROMETHEUS_PUSHGATEWAY_URL` |

---

## Key Conventions

- **Mock repositories in tests**: use the `MockRepository` pattern from `leases.service.spec.ts` — `createMockRepository()` returns `Partial<Record<keyof Repository<T>, jest.Mock>>`.
- **DTOs** use `class-validator` decorators. All controller inputs go through a DTO.
- **Enums** are defined in entity files and reused across DTOs and services.
- **CAPTCHA**: Login and register require a `captchaToken` field. In tests/local dev, configure `TURNSTILE_SECRET_KEY` or the service can be bypassed when the key is absent.
- **Language**: Docs, comments, and commit messages are primarily in Spanish. Code identifiers are in English.
