# PULSE

PULSE is an operations workspace for small and medium-sized businesses. It keeps customers, orders, inventory, payments, printable invoices, CSV exports, team tasks and an audit trail in one multi-tenant application, so the numbers everyone sees come from the same transactions.

- **Backend:** Node 22, Express, TypeScript, Prisma 6, PostgreSQL 16, Zod
- **Frontend:** React 18, Vite 6, Tailwind CSS 3, Radix (shadcn-style components), TanStack Query, React Hook Form, Recharts, Framer Motion, GSAP, React Three Fiber
- **Tests:** Vitest, Supertest (against a real Postgres), React Testing Library, Playwright

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the domain model, business rules, API reference and security design.

## Repository layout

```
apps/api        Express API: modules/<feature>/{*.routes.ts, *.service.ts}, Prisma schema, migrations, seed
apps/web        React SPA: features/<feature>/, components/ui, layouts, routes, e2e/
packages/shared Zod schemas, enums, permission matrix and pure business rules used by both apps
```

## Local development

Requirements: Node 20+, pnpm 10 (`corepack enable`), PostgreSQL 16.

```bash
pnpm install
```

```bash
cp .env.example .env
```

Create a database and role that match `DATABASE_URL`, plus a test database whose name contains `test`. Then apply migrations and load the demo data:

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

The web app runs on http://localhost:5173 and proxies `/api` to the API on port 4000.

**Demo sign-ins** (from the seed, password `pulse-demo-2026`):
- `owner@pulse.demo` (Owner)
- `manager@pulse.demo` (Manager)
- `staff@pulse.demo` (Staff)

The seed creates six months of consistent history: 42 customers, 22 products, about 200 orders, payments, refunds, stock movements and audit entries. It refuses to run twice.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | API (tsx watch) and web (Vite) together |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm lint` | ESLint over the monorepo (`no-explicit-any` is an error) |
| `pnpm test` | Unit tests (shared, web) and API integration tests |
| `pnpm test:e2e` | Playwright journeys (desktop and mobile); starts its own API and web servers |
| `pnpm build` | Production builds of the API (tsup) and web (Vite) |

### Test databases

- **API integration tests** use `TEST_DATABASE_URL` (default `postgresql://pulse:pulse@localhost:5432/pulse_test`). Migrations are applied with `prisma migrate deploy` and tables are truncated before each test. The suite refuses to run against a database whose name doesn't contain `test`.
- **E2E tests** use `E2E_DATABASE_URL` (default `.../pulse_e2e`). Each test registers its own workspace.

## Docker

```bash
docker compose up --build
```

This starts Postgres, the API (which runs `prisma migrate deploy` on start) and nginx serving the SPA on http://localhost:8080. nginx also proxies `/api` so the session cookie stays first-party.

To load demo data into the container database:

```bash
docker compose exec api node dist/prisma/seed.js
```

Set `POSTGRES_PASSWORD`, `WEB_ORIGIN` and `WEB_PORT` in your shell or a `.env` file to override the defaults. In production, serve over HTTPS: the API sets a `Secure`, `__Host-` session cookie when `NODE_ENV=production`.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `WEB_ORIGIN` | yes | `http://localhost:5173` | Exact web origin. Mutating requests from any other `Origin` are rejected. |
| `PORT` | no | `4000` | API port |
| `NODE_ENV` | no | `development` | `production` enables secure cookies and JSON logs |
| `SESSION_TTL_DAYS` | no | `14` | Sliding session lifetime |
| `LOG_LEVEL` | no | `info` | pino log level |
| `TRUST_PROXY` | no | `0` | Number of proxies in front of the API, so rate limits see real client IPs |
| `TEST_DATABASE_URL` | tests | `.../pulse_test` | Integration test database |
| `E2E_DATABASE_URL` | e2e | `.../pulse_e2e` | Playwright database |

The API validates its environment at boot and exits with a clear message if anything is missing or malformed.
