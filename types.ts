export type SourceType = 'sap' | 'utility' | 'travel';
export type RecordStatus = 'pending' | 'approved' | 'flagged' | 'rejected';
export type Scope = 1 | 2 | 3;

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface IngestionJob {
  id: string;
  tenant_id: string;
  source_type: SourceType;
  file_name: string;
  status: 'processing' | 'completed' | 'failed';
  total_rows: number;
  parsed_rows: number;
  failed_rows: number;
  error_details: ParseError[];
  uploaded_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ParseError {
  row: number;
  message: string;
  raw?: string;
}

export interface EmissionRecord {
  id: string;
  tenant_id: string;
  job_id: string;
  source_type: SourceType;
  scope: Scope;
  category: string;
  period_start: string | null;
  period_end: string | null;
  // SAP
  plant_code: string;
  cost_center: string;
  material_number: string;
  vendor: string;
  // Utility
  meter_id: string;
  tariff_code: string;
  // Travel
  traveler_id: string;
  origin: string;
  destination: string;
  distance_km: number | null;
  transport_mode: string;
  // Quantities
  raw_quantity: number | null;
  raw_unit: string;
  raw_date: string;
  normalized_quantity: number | null;
  normalized_unit: string;
  // Emission
  emission_factor_kgco2e: number | null;
  co2e_kg: number | null;
  // Analyst
  status: RecordStatus;
  is_edited: boolean;
  analyst_notes: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  // Source tracking
  source_row_hash: string;
  source_row_index: number | null;
  flags: string[];
  raw_row: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: string;
  record_id: string;
  tenant_id: string;
  action: string;
  actor: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  note: string;
  created_at: string;
}

export interface ParsedRow {
  scope: Scope;
  category: string;
  period_start?: string;
  period_end?: string;
  plant_code?: string;
  cost_center?: string;
  material_number?: string;
  vendor?: string;
  meter_id?: string;
  tariff_code?: string;
  traveler_id?: string;
  origin?: string;
  destination?: string;
  distance_km?: number;
  transport_mode?: string;
  raw_quantity: number | null;
  raw_unit: string;
  raw_date: string;
  normalized_quantity: number | null;
  normalized_unit: string;
  emission_factor_kgco2e?: number;
  co2e_kg?: number;
  flags: string[];
  raw_row: Record<string, string>;
  source_row_index: number;
  source_row_hash: string;
}

export interface DashboardStats {
  totalRecords: number;
  pending: number;
  approved: number;
  flagged: number;
  rejected: number;
  totalCo2e: number;
  byScope: Record<number, number>;
  bySource: Record<string, number>;
  recentJobs: IngestionJob[];
}
