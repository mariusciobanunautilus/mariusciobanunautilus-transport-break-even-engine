# Transport Break-even Engine

Operational break-even and pricing workspace for road transport scenarios.

The app converts transport assumptions into:

- annual cost and loaded-km break-even
- tonne-km break-even
- markup-based customer rates
- VAT invoice view
- business-tax-adjusted profit
- sensitivity tables for vehicles, payload, load factor, markup and fuel

The blueprint engine now supports three fleet strategies:

- single vehicle
- multiple vehicles of the same type
- mixed fleets with separate vehicle groups

Mixed fleets are calculated group by group first, then aggregated into fleet-level cost, break-even, rate and profit outputs. The UI formats monetary, rate and measurement inputs/outputs to two decimals while the engine keeps full precision internally. Vehicle counts are whole units.

## Current Implementation Sprints

1. Backend calculation preview engine
   - Pure blueprint calculation engine in `shared/blueprintEngine.js`
   - `POST /api/calculations/preview`
   - Baseline, same-type fleet and mixed-fleet tests

2. Reference and tax cascade APIs
   - `GET /api/countries`
   - `GET /api/countries/:countryId/company-types`
   - `GET /api/business-models`
   - `GET /api/vehicle-classes`
   - `GET /api/tax-profile`

3. Saved runs and history
   - `POST /api/calculations`
   - `GET /api/calculations`
   - `GET /api/calculations/:id`
   - `DELETE /api/calculations/:id`
   - Immutable input, tax, vehicle and result snapshots in the local store

4. Pricing and sensitivity previews
   - `POST /api/pricing-scenarios/preview`
   - `POST /api/sensitivity/preview`

5. Frontend workflow
   - Dashboard
   - Company & Tax
   - Fleet inputs
   - Break-even
   - Pricing
   - Sensitivity
   - Vehicle classes
   - History

6. Audit and export-ready reporting
   - `GET /api/audit-log`
   - `GET /api/exports/:calculationRunId/json`
   - SQL draft includes calculation result, pricing scenario and audit tables

7. Production hardening
   - Built-in email/password auth with bearer sessions
   - Shared workspace scoping for saved runs, exports and audit rows
   - Production startup guard for missing `DATABASE_URL`
   - Restricted CORS via `CORS_ORIGIN`
   - Tax/reference governance metadata for source, confidence and review status

8. Verification
   - Shared formula tests
   - Backend storage tests
   - Frontend production build

## Commands

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run database migration and seed data:

```bash
DATABASE_URL=postgres://user:password@host:5432/database npm run db:migrate
```

Build the frontend:

```bash
npm run build
```

Run frontend:

```bash
npm run dev:frontend
```

Run backend:

```bash
npm run dev:backend
```

Local login defaults without Postgres:

- email: `admin@example.com`
- password: `admin12345`

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `WORKSPACE_NAME` in `backend/.env` to override them.

## Notes

The frontend now requires a backend session. Calculation previews still use the shared engine as a local fallback after sign-in if a preview endpoint is temporarily unavailable, but login, saving, history and export require the backend process.

## Database Behaviour

When `DATABASE_URL` is configured, the backend reads reference data from Postgres and persists saved runs to:

- `calculation_runs`
- `calculation_results`
- `pricing_scenarios`
- `audit_log`

When `DATABASE_URL` is not configured, the backend falls back to an in-memory store so local development still works. In-memory users, sessions and saved runs are lost when the backend restarts.

In production, `DATABASE_URL` is required. `CORS_ORIGIN` should be set to the frontend origin when the frontend is hosted separately; Render deployments also accept `RENDER_EXTERNAL_URL` as a restricted same-service origin fallback. The first workspace admin is bootstrapped from `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `WORKSPACE_NAME` when the database has no users yet.

The current database layer uses `pg` and `backend/schema.sql`. Prisma/TypeScript migrations are still a future hardening step, but the current app no longer depends on memory storage when Postgres is configured.

The tax profile is a modelling layer for business planning. It is not tax advice. All country-specific tax and payroll assumptions require review before commercial or statutory use.
