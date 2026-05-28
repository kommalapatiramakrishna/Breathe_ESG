# Breathe ESG — Data Ingestion Demo

Lightweight ESG data ingestion demo app (React + Vite) with Supabase schema and example seed data.

**Quick summary**
- Purpose: ingest SAP, utility, and travel activity rows, normalize them, and track analyst review.
- UI: React + Vite in [src/](src/).
- DB: Supabase/Postgres migrations live in [supabase/migrations/](supabase/migrations/).

**Prerequisites**
- Node 18+ and npm
- Access to a Supabase project or Postgres instance to run the SQL migrations

Setup

1. Install dependencies

```
npm install
```

2. Run development server

```
npm run dev
```

Build

```
npm run build
```

Database migrations and seeds

This repository includes SQL migration files under [supabase/migrations/](supabase/migrations/).

- Core schema: [supabase/migrations/20260525182548_breathe_esg_schema.sql](supabase/migrations/20260525182548_breathe_esg_schema.sql)
- Demo seed: [supabase/migrations/999997_seed_demo_data.sql](supabase/migrations/999997_seed_demo_data.sql)
- Additional random seed (added): [supabase/migrations/999998_random_seed_data.sql](supabase/migrations/999998_random_seed_data.sql)

Apply these files in your database using the Supabase SQL editor, `psql`, or the `supabase` CLI. Example with `psql`:

```
# replace with your connection details
psql "postgresql://user:password@host:5432/dbname" -f supabase/migrations/20260525182548_breathe_esg_schema.sql
psql "postgresql://user:password@host:5432/dbname" -f supabase/migrations/999997_seed_demo_data.sql
psql "postgresql://user:password@host:5432/dbname" -f supabase/migrations/999998_random_seed_data.sql
```

Project structure (high level)

- [src/](src/) — React app and components (IngestPage, Dashboard, ReviewQueue, etc.)
- [src/lib/parsers](src/lib/parsers) — data parsers for SAP, travel, utility files
- [supabase/migrations](supabase/migrations) — schema and seed SQL files
- package.json — scripts: `dev`, `build`, `lint`, `typecheck`

Notes & recent housekeeping

- Sample CSV [src/samples/sample_sap.csv](src/samples/sample_sap.csv) was removed to clean the repo. If you need sample files, re-add them under [src/samples/](src/samples/) or use the Ingest page Download sample button in the UI ([src/components/IngestPage.tsx](src/components/IngestPage.tsx)).
- Generated folders `node_modules/` and `dist/` were removed locally to keep the workspace tidy.

Analysis pointers

- The seed data includes mixed `source_type` rows with `status` and `flags` that let you test approval and flagging workflows.
- Useful SQL queries:

```
# total CO2e by source
SELECT source_type, SUM(co2e_kg) AS total_co2e FROM emission_records GROUP BY source_type;

# flagged records
SELECT * FROM emission_records WHERE flags <> '[]'::jsonb OR status = 'flagged';

# pending ratio
SELECT COUNT(*) FILTER (WHERE status='pending')::float / COUNT(*) AS pending_ratio FROM emission_records;
```

If you'd like, I can:
- Run these queries against a running database (you'll need to provide connection details), or
- Add a small script that connects to Supabase and outputs the above analysis automatically.

---

Created/updated as part of repository cleanup and demo seeding.
