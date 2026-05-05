# Transport Break-even Engine

Web application for turning transport operating assumptions into break-even
rates, customer pricing, EBIT, tax, and after-tax profitability.

The first version is rebuilt from the workbook
`break_even_transport_engine_cascading_tax_profile_fixed_v002.xlsx`.

## What Is Included

- Workbook-faithful calculation engine in `shared/`
- React dashboard in `frontend/`
- Express API in `backend/`
- PostgreSQL schema and seed data in `backend/schema.sql`
- Seed data for Austria, Germany, Romania, Hungary, Bulgaria, Czechia,
  Slovakia, and Manual / Custom
- Two workbook operating profiles: Long Distance 40t and Regional 40t
- Vehicle class capability sensitivity from van to EMS / high-capacity 60t

## Calculation Flow

```text
Inputs
  -> operational km and activity hours
  -> variable cost per total km and per loaded km
  -> driver cost from salary, employer contribution, allowances, and drivers
  -> fixed vehicle and overhead cost
  -> total annual cost
  -> break-even EUR per loaded km
  -> selected customer rate from markup
  -> EBIT, VAT invoice layer, business tax, after-tax profit
```

## Run Locally

You need Node.js `20.19+` and npm.

```bash
npm install
npm run dev:frontend
npm run dev:backend
```

Frontend: `http://localhost:5173`

Backend health check: `http://localhost:10000/api/health`

## Database

Create a PostgreSQL database and run:

```bash
psql "$DATABASE_URL" -f backend/schema.sql
```

Then set:

```bash
cp backend/.env.example backend/.env
```

`DATABASE_URL` is optional for local dashboard use. When present, calculation
runs are saved to `calculation_runs`.

## API

```text
GET  /api/health
GET  /api/reference-data
POST /api/calculations
POST /api/vehicles/LONG_DISTANCE_40T/calculations
POST /api/vehicles/REGIONAL_40T/calculations
```

## GitHub

Target repository name: `transport-break-even-engine`.
# transport-break-even-engine
