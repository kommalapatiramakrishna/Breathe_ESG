-- 999996_ingestion_jobs_rls_policy.sql
-- Correct RLS policies for ingestion_jobs, ensuring authenticated users can insert only their tenant rows.

ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant jobs"
  ON ingestion_jobs FOR SELECT
  TO authenticated
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

CREATE POLICY "Users can insert jobs for their tenant"
  ON ingestion_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Users can update their tenant jobs"
  ON ingestion_jobs FOR UPDATE
  TO authenticated
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
  WITH CHECK (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

CREATE POLICY "Users can delete their tenant jobs"
  ON ingestion_jobs FOR DELETE
  TO authenticated
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

ALTER TABLE emission_records ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Users can delete their tenant records"
  ON emission_records FOR DELETE
  TO authenticated
  USING (tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));
