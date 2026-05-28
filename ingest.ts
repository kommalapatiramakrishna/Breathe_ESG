import { supabase } from './supabase';
import { parseSAP } from './parsers/sapParser';
import { parseUtility } from './parsers/utilityParser';
import { parseTravel } from './parsers/travelParser';
import type { SourceType, ParsedRow } from './types';

async function getCurrentTenantId(userId: string): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error('Unable to get Supabase session:', sessionError);
    throw new Error('Unable to read auth session. Please sign out and sign back in.');
  }

  const session = sessionData.session;
  if (!session?.user) {
    throw new Error('No authenticated user session found. Please sign in before uploading.');
  }

  if (session.user.id !== userId) {
    throw new Error('Authenticated user mismatch. Please sign out and sign back in.');
  }

  const tenantId = (session.user as any)?.app_metadata?.tenant_id;
  if (!tenantId) {
    throw new Error(
      'Your account is missing tenant metadata. Please sign out and sign back in, or contact your administrator.'
    );
  }

  return tenantId;
}

export async function ingestFile(
  file: File,
  sourceType: SourceType,
  userId: string,
  onProgress?: (pct: number) => void
): Promise<{ jobId: string; parsed: number; failed: number; errors: { row: number; message: string }[] }> {
  const text = await file.text();

  let parsed: ParsedRow[];
  let errors: { row: number; message: string; raw?: string }[];

  if (sourceType === 'sap') {
    ({ rows: parsed, errors } = parseSAP(text));
  } else if (sourceType === 'utility') {
    ({ rows: parsed, errors } = parseUtility(text));
  } else {
    ({ rows: parsed, errors } = parseTravel(text));
  }

  const tenantId = await getCurrentTenantId(userId);

  // Create job record
  console.log('Creating ingestion job', { tenantId, userId, sourceType, fileName: file.name });
  const { data: job, error: jobErr } = await supabase
    .from('ingestion_jobs')
    .insert({
      tenant_id: tenantId,
      source_type: sourceType,
      file_name: file.name,
      status: 'processing',
      total_rows: parsed.length + errors.length,
      parsed_rows: 0,
      failed_rows: errors.length,
      error_details: errors,
      uploaded_by: userId,
    })
    .select('id')
    .single();

  if (jobErr || !job) {
    console.error('Create job error:', jobErr);
    throw new Error(jobErr?.message ?? `Failed to create job: ${JSON.stringify(jobErr)}`);
  }

  const jobId = job.id;

  // Insert records in batches of 50
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < parsed.length; i += BATCH) {
    const batch = parsed.slice(i, i + BATCH);
    const records = batch.map((r: ParsedRow) => ({
      tenant_id: tenantId,
      job_id: jobId,
      source_type: sourceType,
      scope: r.scope,
      category: r.category,
      period_start: r.period_start ?? null,
      period_end: r.period_end ?? null,
      plant_code: r.plant_code ?? '',
      cost_center: r.cost_center ?? '',
      material_number: r.material_number ?? '',
      vendor: r.vendor ?? '',
      meter_id: r.meter_id ?? '',
      tariff_code: r.tariff_code ?? '',
      traveler_id: r.traveler_id ?? '',
      origin: r.origin ?? '',
      destination: r.destination ?? '',
      distance_km: r.distance_km ?? null,
      transport_mode: r.transport_mode ?? '',
      raw_quantity: r.raw_quantity,
      raw_unit: r.raw_unit,
      raw_date: r.raw_date,
      normalized_quantity: r.normalized_quantity,
      normalized_unit: r.normalized_unit,
      emission_factor_kgco2e: r.emission_factor_kgco2e ?? null,
      co2e_kg: r.co2e_kg ?? null,
      status: r.flags.length > 0 ? 'flagged' : 'pending',
      flags: r.flags,
      raw_row: r.raw_row,
      source_row_index: r.source_row_index,
      source_row_hash: r.source_row_hash,
    }));

    const { error: insErr } = await supabase.from('emission_records').insert(records);
    if (insErr) {
      console.error('Batch insert error:', insErr);
      throw new Error(insErr.message ?? 'Batch insert error');
    }
    inserted += batch.length;
    onProgress?.(Math.round((inserted / parsed.length) * 100));
  }

  // Update job to completed
  const { error: updErr } = await supabase
    .from('ingestion_jobs')
    .update({ status: 'completed', parsed_rows: inserted, completed_at: new Date().toISOString() })
    .eq('id', jobId);
  if (updErr) {
    console.error('Failed to update job status:', updErr);
    throw new Error(updErr.message ?? 'Failed to update job status');
  }

  return { jobId, parsed: inserted, failed: errors.length, errors };
}
