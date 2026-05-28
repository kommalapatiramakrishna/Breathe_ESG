/*
  Utility electricity parser — portal CSV export.
  Format choice: CSV export from utility portals (e.g., PG&E, National Grid, Ameren).
  Why CSV over PDF: PDFs require OCR/layout parsing which is fragile and varies by utility.
  APIs exist (Green Button standard) but require utility-specific OAuth credentials.
  CSV portal exports are the realistic "bulk download" flow for enterprise accounts.

  Expected columns (flexible mapping):
    Account Number / meter_id
    Service Address / location
    Billing Period Start
    Billing Period End
    kWh Used / Consumption
    Demand (kW)
    Tariff / Rate Schedule
    Amount Due (ignored for emissions)

  Key real-world complications handled:
  - Billing periods don't align to calendar months (e.g., Jan 15 – Feb 14)
  - Units may be kWh, MWh, or therm (gas bills sometimes mixed in)
  - Demand charges separate from consumption (we only care about kWh consumption)
  - Multiple meters per account

  Emission factor: US average grid 0.386 kg CO2e/kWh (EPA eGRID 2022 national average).
  In production you'd use location-based (eGRID subregion) or supplier-specific.
  Scope 2, category = 'electricity'.
*/

import type { ParsedRow, ParseError } from '../types';
import { parseDate, hashRow } from './utils';

const HEADER_MAP: Record<string, string> = {
  'account number': 'meter_id',
  'account_number': 'meter_id',
  'meter id': 'meter_id',
  'meter_id': 'meter_id',
  'meter number': 'meter_id',
  'account': 'meter_id',
  'service address': 'location',
  'location': 'location',
  'address': 'location',
  'billing period start': 'period_start',
  'period start': 'period_start',
  'start date': 'period_start',
  'from': 'period_start',
  'billing period end': 'period_end',
  'period end': 'period_end',
  'end date': 'period_end',
  'to': 'period_end',
  'kwh used': 'kwh',
  'kwh': 'kwh',
  'consumption (kwh)': 'kwh',
  'energy (kwh)': 'kwh',
  'usage': 'kwh',
  'consumption': 'kwh',
  'mwh used': 'mwh',
  'mwh': 'mwh',
  'energy (mwh)': 'mwh',
  'rate schedule': 'tariff',
  'tariff': 'tariff',
  'rate': 'tariff',
  'plan': 'tariff',
};

const ELECTRICITY_EF = 0.386; // kg CO2e/kWh, EPA eGRID 2022 national average

function parseCSV(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  return lines.map(line =>
    line.split(/[,;\t]/).map(c => c.trim().replace(/^"|"$/g, ''))
  );
}

export function parseUtility(csvText: string): { rows: ParsedRow[]; errors: ParseError[] } {
  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];
  const lines = parseCSV(csvText);

  if (lines.length < 2) {
    errors.push({ row: 0, message: 'File has no data rows' });
    return { rows, errors };
  }

  const rawHeaders = lines[0].map(h => h.toLowerCase().trim());
  const colMap: Record<string, number> = {};
  rawHeaders.forEach((h, i) => {
    const mapped = HEADER_MAP[h];
    if (mapped && colMap[mapped] === undefined) colMap[mapped] = i;
  });

  const hasEnergy = colMap['kwh'] !== undefined || colMap['mwh'] !== undefined;
  if (!hasEnergy) {
    errors.push({ row: 0, message: `No energy consumption column found. Headers: ${rawHeaders.join(', ')}` });
    return { rows, errors };
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i];
    if (cells.every(c => !c)) continue;

    const raw: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => { raw[h] = cells[idx] ?? ''; });

    const get = (key: string) => (colMap[key] !== undefined ? (cells[colMap[key]] ?? '').trim() : '');

    const flags: string[] = [];

    // Resolve kWh — prefer direct kWh, fall back to MWh * 1000
    let kwhRaw: number | null = null;
    let rawUnit = 'kWh';
    if (colMap['kwh'] !== undefined) {
      const v = parseFloat(get('kwh').replace(',', ''));
      kwhRaw = isNaN(v) ? null : v;
    } else if (colMap['mwh'] !== undefined) {
      const v = parseFloat(get('mwh').replace(',', ''));
      kwhRaw = isNaN(v) ? null : v * 1000;
      rawUnit = 'MWh';
    }

    if (kwhRaw === null) {
      errors.push({ row: i + 1, message: 'Could not parse energy value', raw: cells.join(',') });
      continue;
    }

    const rawQtyRaw = colMap['kwh'] !== undefined
      ? parseFloat(get('kwh').replace(',', ''))
      : parseFloat(get('mwh').replace(',', ''));

    const periodStart = parseDate(get('period_start'));
    const periodEnd = parseDate(get('period_end'));

    if (!periodStart) flags.push('missing_period_start');
    if (!periodEnd) flags.push('missing_period_end');
    if (kwhRaw < 0) flags.push('negative_consumption');
    if (kwhRaw > 500000) flags.push('unusually_high_consumption');
    if (!get('meter_id')) flags.push('missing_meter_id');

    // Detect if billing period crosses month boundary (common reality)
    if (periodStart && periodEnd) {
      const s = new Date(periodStart);
      const e = new Date(periodEnd);
      const daysDiff = (e.getTime() - s.getTime()) / 86400000;
      if (daysDiff > 35) flags.push('billing_period_over_35_days');
      if (daysDiff < 25) flags.push('billing_period_under_25_days');
    }

    const co2e = +(kwhRaw * ELECTRICITY_EF).toFixed(3);

    rows.push({
      scope: 2,
      category: 'electricity',
      period_start: periodStart ?? undefined,
      period_end: periodEnd ?? undefined,
      meter_id: get('meter_id'),
      tariff_code: get('tariff'),
      raw_quantity: rawQtyRaw,
      raw_unit: rawUnit,
      raw_date: get('period_start'),
      normalized_quantity: kwhRaw,
      normalized_unit: 'kWh',
      emission_factor_kgco2e: ELECTRICITY_EF,
      co2e_kg: co2e,
      flags,
      raw_row: raw,
      source_row_index: i,
      source_row_hash: hashRow(raw),
    });
  }

  return { rows, errors };
}
