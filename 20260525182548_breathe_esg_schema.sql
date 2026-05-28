/*
  # Breathe ESG Data Ingestion Schema

  ## Overview
  Multi-tenant ESG data ingestion platform supporting three source types:
  SAP (fuel/procurement), utility CSV (electricity), and travel platform exports.

  ## Tables

  ### tenants
  - Client companies onboarded to the platform
  - Supports multi-tenancy: all data rows are scoped to a tenant

  ### ingestion_jobs
  - Tracks each file upload / ingestion run
  - Records source type, file name, row counts, parse errors, and status
  - Acts as the "source of truth" envelope: every emission_record links back here

  ### emission_records
  - Normalized activity/emission rows across all source types
  - scope: 1 (fuel combustion), 2 (purchased electricity), 3 (travel)
  - category: granular sub-type (diesel, electricity, flight, hotel, ground)
  - raw_quantity + raw_unit preserved alongside normalized_kwh / normalized_liters
  - status: pending -> approved / flagged / rejected
  - is_edited: true if analyst changed any field post-ingestion
  - source_row_hash: SHA-256 of original row for dedup
  - period_start / period_end: activity period (billing periods don't align to calendar months)
  - plant_code / cost_center: SAP organizational dimensions
  - origin / destination: for travel legs
  - distance_km: computed or given for flights
  - emission_factor_kgco2e: factor applied
  - co2e_kg: final computed value (NULL until analyst approves)

  ### audit_log
  - Append-only log of every state change to an emission_record
  - Records old_value / new_value as JSONB for full traceability

  ## Security
  - RLS enabled on all tables
  - Authenticated users can read/write their own tenant's data
  - Audit log is insert-only from authenticated users; no updates/deletes allowed
*/

-- tenants
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- ingestion_jobs
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  source_type text NOT NULL CHECK (source_type IN ('sap', 'utility', 'travel')),
  file_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  total_rows integer NOT NULL DEFAULT 0,
  parsed_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  error_details jsonb DEFAULT '[]',
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;

-- emission_records
CREATE TABLE IF NOT EXISTS emission_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL REFERENCES ingestion_jobs(id),
  source_type text NOT NULL CHECK (source_type IN ('sap', 'utility', 'travel')),
  scope integer NOT NULL CHECK (scope IN (1, 2, 3)),
  category text NOT NULL,
  -- Period
  period_start date,
  period_end date,
  -- SAP-specific
  plant_code text DEFAULT '',
  cost_center text DEFAULT '',
  material_number text DEFAULT '',
  vendor text DEFAULT '',
  -- Utility-specific
  meter_id text DEFAULT '',
  tariff_code text DEFAULT '',
  -- Travel-specific
  traveler_id text DEFAULT '',
  origin text DEFAULT '',
  destination text DEFAULT '',
  distance_km numeric,
  transport_mode text DEFAULT '',
  -- Raw values as ingested (preserve source fidelity)
  raw_quantity numeric,
  raw_unit text DEFAULT '',
  raw_date text DEFAULT '',
  -- Normalized values
  normalized_quantity numeric,
  normalized_unit text DEFAULT '',
  -- Computed emission
  emission_factor_kgco2e numeric,
  co2e_kg numeric,
  -- Analyst workflow
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'flagged', 'rejected')),
  is_edited boolean NOT NULL DEFAULT false,
  analyst_notes text DEFAULT '',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  -- Source tracking / dedup
  source_row_hash text DEFAULT '',
  source_row_index integer,
  -- Flags raised during parsing
  flags jsonb DEFAULT '[]',
  -- Full original row snapshot
  raw_row jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE emission_records ENABLE ROW LEVEL SECURITY;

-- audit_log (append-only)
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES emission_records(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  action text NOT NULL CHECK (action IN ('created', 'status_changed', 'field_edited', 'approved', 'flagged', 'rejected')),
  actor uuid REFERENCES auth.users(id),
  old_value jsonb,
  new_value jsonb,
  note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- =====================
-- RLS POLICIES
-- =====================

-- Helper: users carry their tenant_id in app_metadata
-- tenants: any authenticated user can read all tenants (needed for onboarding); only service role inserts
CREATE POLICY "Authenticated users can read tenants"
  ON tenants FOR SELECT
  TO authenticated
  USING (true);

-- ingestion_jobs: scoped to tenant via app_metadata
CREATE POLICY "Users can view their tenant jobs"
  ON ingestion_jobs FOR SELECT
  TO authenticated
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

CREATE POLICY "Users can insert jobs for their tenant"
  ON ingestion_jobs FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

CREATE POLICY "Users can update their tenant jobs"
  ON ingestion_jobs FOR UPDATE
  TO authenticated
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

-- emission_records
CREATE POLICY "Users can view their tenant records"
  ON emission_records FOR SELECT
  TO authenticated
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

CREATE POLICY "Users can insert records for their tenant"
  ON emission_records FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

CREATE POLICY "Users can update their tenant records"
  ON emission_records FOR UPDATE
  TO authenticated
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

-- audit_log: insert only, read own tenant
CREATE POLICY "Users can read their tenant audit log"
  ON audit_log FOR SELECT
  TO authenticated
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

CREATE POLICY "Users can insert audit log entries"
  ON audit_log FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

-- =====================
-- INDEXES
-- =====================
CREATE INDEX IF NOT EXISTS idx_emission_records_tenant ON emission_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_emission_records_job ON emission_records(job_id);
CREATE INDEX IF NOT EXISTS idx_emission_records_status ON emission_records(status);
CREATE INDEX IF NOT EXISTS idx_emission_records_scope ON emission_records(scope);
CREATE INDEX IF NOT EXISTS idx_emission_records_source_type ON emission_records(source_type);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_tenant ON ingestion_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_record ON audit_log(record_id);

-- =====================
-- SEED: demo tenant
-- =====================
INSERT INTO tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Acme Manufacturing Co.', 'acme')
ON CONFLICT (slug) DO NOTHING;
