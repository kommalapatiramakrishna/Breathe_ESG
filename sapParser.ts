/*
  SAP flat-file parser (MM60 / ME2M-style export).
  Format choice: SAP flat-file (tab-separated .txt or .csv) from the MM60 Materials
  Movement transaction. This is what facilities teams actually download — OData requires
  developer access that most clients don't grant, IDocs require RFC middleware, BAPIs need
  ABAP knowledge. MM60 flat file is the de-facto "give us your SAP data" format.

  Columns we handle (German & English header variants both mapped):
    Buchungsdatum / Posting Date
    Werk / Plant
    Kostenstelle / Cost Center
    Materialnummer / Material Number
    Materialbezeichnung / Material Description
    Lieferant / Vendor
    Menge / Quantity
    Basismengeneinheit / Base Unit
    Bewegungsart / Movement Type

  Units normalized: L -> normalized liters, KG -> kg, M3 -> m3 (then converted to liters at 0.84 kg/L for diesel)
  Emission factors (kg CO2e): diesel/petrol Scope 1, LPG Scope 1.
  Procurement materials (non-fuel) are Scope 3, category = 'procurement'.
*/

import type { ParsedRow, ParseError } from '../types';
import { parseDate, hashRow, detectFuelCategory, normalizeSapUnit, FUEL_EMISSION_FACTORS } from './utils';

const HEADER_MAP: Record<string, string> = {
  'buchungsdatum': 'date',
  'posting date': 'date',
  'posting_date': 'date',
  'werk': 'plant',
  'plant': 'plant',
  'plant_code': 'plant',
  'kostenstelle': 'cost_center',
  'cost center': 'cost_center',
  'cost_center': 'cost_center',
  'materialnummer': 'material',
  'material number': 'material',
  'material_number': 'material',
  'materialbezeichnung': 'description',
  'material description': 'description',
  'lieferant': 'vendor',
  'vendor': 'vendor',
  'supplier': 'vendor',
  'menge': 'quantity',
  'quantity': 'quantity',
  'amount': 'quantity',
  'basismengeneinheit': 'unit',
  'base unit': 'unit',
  'unit of measure': 'unit',
  'uom': 'unit',
  'bewegungsart': 'movement_type',
  'movement type': 'movement_type',
};

function parseCSV(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  return lines.map(line =>
    line.split(/[;\t,]/).map(c => c.trim().replace(/^"|"$/g, ''))
  );
}

export function parseSAP(csvText: string): { rows: ParsedRow[]; errors: ParseError[] } {
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
    if (mapped) colMap[mapped] = i;
  });

  const required = ['quantity', 'unit'];
  for (const req of required) {
    if (colMap[req] === undefined) {
      errors.push({ row: 0, message: `Missing required column: ${req}. Headers found: ${rawHeaders.join(', ')}` });
      return { rows, errors };
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i];
    if (cells.every(c => !c)) continue;

    const raw: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => { raw[h] = cells[idx] ?? ''; });

    const get = (key: string) => (colMap[key] !== undefined ? (cells[colMap[key]] ?? '').trim() : '');

    const rawQtyStr = get('quantity').replace(',', '.');
    const rawQty = parseFloat(rawQtyStr);
    if (isNaN(rawQty)) {
      errors.push({ row: i + 1, message: `Invalid quantity "${rawQtyStr}"`, raw: cells.join(';') });
      continue;
    }

    const rawUnit = get('unit').toUpperCase();
    const description = get('description').toLowerCase();
    const material = get('material');
    const flags: string[] = [];

    const { normalizedQty, normalizedUnit } = normalizeSapUnit(rawQty, rawUnit);
    const category = detectFuelCategory(description, material);
    const isFuel = category !== 'procurement';
    const scope = isFuel ? 1 : 3;

    if (!isFuel && !description && !material) {
      flags.push('unknown_material');
    }

    const rawDate = get('date');
    const parsedDate = parseDate(rawDate);
    if (rawDate && !parsedDate) flags.push('unparseable_date');

    const factor = isFuel ? (FUEL_EMISSION_FACTORS[category] ?? null) : null;
    const co2e = factor && normalizedQty != null ? +(normalizedQty * factor).toFixed(3) : null;

    if (normalizedQty !== null && normalizedQty < 0) flags.push('negative_quantity');
    if (normalizedQty !== null && normalizedQty > 100000) flags.push('unusually_large_quantity');

    rows.push({
      scope,
      category,
      period_start: parsedDate ?? undefined,
      period_end: parsedDate ?? undefined,
      plant_code: get('plant'),
      cost_center: get('cost_center'),
      material_number: material,
      vendor: get('vendor'),
      raw_quantity: rawQty,
      raw_unit: rawUnit,
      raw_date: rawDate,
      normalized_quantity: normalizedQty,
      normalized_unit: normalizedUnit,
      emission_factor_kgco2e: factor ?? undefined,
      co2e_kg: co2e ?? undefined,
      flags,
      raw_row: raw,
      source_row_index: i,
      source_row_hash: hashRow(raw),
    });
  }

  return { rows, errors };
}
