/*
  Corporate travel parser — Concur/Navan-style CSV export.
  Format choice: CSV export from Concur's "Expense Report" or Navan's trip export endpoint.
  Why CSV: Concur's SAP Concur APIs (v4) require OAuth2 company tokens that enterprise IT
  rarely provisions for external vendors. The "Intelligence" CSV export is the practical
  bulk data path. Navan similarly offers CSV trip exports.

  Categories & Scopes (all Scope 3):
  - flight:  category = 'air_travel',   EF varies by cabin/distance (DEFRA 2023)
  - hotel:   category = 'hotel_stay',   EF = 10.0 kg CO2e/room-night (DEFRA avg)
  - ground:  category = 'ground_transport' (taxi/rideshare/rental car)

  Flight distance: if not given, estimated from airport codes using great-circle approximation.
  We carry a small lookup table of IATA codes -> lat/lon for the 50 most common business airports.
  For unknown pairs we flag as 'distance_estimated_missing_route'.

  DEFRA 2023 flight factors (kg CO2e per passenger-km, including RFI):
    short_haul (<1000km): 0.255
    medium_haul (1000-3700km): 0.195
    long_haul (>3700km): 0.148
  (Economy class. Business class multiplied by 2.0x, first by 4.0x if cabin known.)
*/

import type { ParsedRow, ParseError } from '../types';
import { parseDate, hashRow } from './utils';
import { estimateFlightDistance } from './airportDistance';

const HEADER_MAP: Record<string, string> = {
  'employee id': 'traveler_id',
  'employee_id': 'traveler_id',
  'traveler id': 'traveler_id',
  'user id': 'traveler_id',
  'expense type': 'expense_type',
  'expense_type': 'expense_type',
  'category': 'expense_type',
  'type': 'expense_type',
  'travel type': 'expense_type',
  'origin': 'origin',
  'from': 'origin',
  'departure': 'origin',
  'departure city': 'origin',
  'from airport': 'origin',
  'destination': 'destination',
  'to': 'destination',
  'arrival': 'destination',
  'arrival city': 'destination',
  'to airport': 'destination',
  'distance (km)': 'distance_km',
  'distance_km': 'distance_km',
  'distance': 'distance_km',
  'km': 'distance_km',
  'nights': 'nights',
  'hotel nights': 'nights',
  'check-in': 'checkin',
  'check-out': 'checkout',
  'date': 'date',
  'travel date': 'date',
  'expense date': 'date',
  'transaction date': 'date',
  'cabin class': 'cabin',
  'class': 'cabin',
  'fare class': 'cabin',
  'mode': 'mode',
  'transport mode': 'mode',
  'vehicle type': 'mode',
};

type CabinClass = 'economy' | 'business' | 'first' | 'unknown';
const CABIN_MULTIPLIERS: Record<CabinClass, number> = {
  economy: 1.0,
  business: 2.0,
  first: 4.0,
  unknown: 1.0,
};

function flightFactor(distanceKm: number, cabin: CabinClass): number {
  let base: number;
  if (distanceKm < 1000) base = 0.255;
  else if (distanceKm < 3700) base = 0.195;
  else base = 0.148;
  return base * CABIN_MULTIPLIERS[cabin];
}

function parseCabin(raw: string): CabinClass {
  const v = raw.toLowerCase();
  if (v.includes('business') || v === 'c' || v === 'j') return 'business';
  if (v.includes('first') || v === 'f' || v === 'a') return 'first';
  if (v.includes('economy') || v === 'y' || v === 'w' || v === 'q') return 'economy';
  return 'unknown';
}

function detectCategory(expenseType: string): 'air_travel' | 'hotel_stay' | 'ground_transport' | null {
  const t = expenseType.toLowerCase();
  if (t.includes('air') || t.includes('flight') || t.includes('plane') || t.includes('airline')) return 'air_travel';
  if (t.includes('hotel') || t.includes('lodging') || t.includes('accommodation') || t.includes('motel')) return 'hotel_stay';
  if (t.includes('taxi') || t.includes('uber') || t.includes('lyft') || t.includes('rideshare') ||
      t.includes('car') || t.includes('rental') || t.includes('ground') || t.includes('train') || t.includes('rail')) return 'ground_transport';
  return null;
}

function parseCSV(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  return lines.map(line =>
    line.split(/[,;\t]/).map(c => c.trim().replace(/^"|"$/g, ''))
  );
}

const GROUND_TRANSPORT_EF = 0.21; // kg CO2e/km, mid-range for taxi/rideshare (DEFRA 2023)
const HOTEL_NIGHT_EF = 10.0; // kg CO2e/room-night (DEFRA 2023 avg)

export function parseTravel(csvText: string): { rows: ParsedRow[]; errors: ParseError[] } {
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

  if (colMap['expense_type'] === undefined && colMap['date'] === undefined) {
    errors.push({ row: 0, message: `Cannot identify travel data columns. Headers: ${rawHeaders.join(', ')}` });
    return { rows, errors };
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i];
    if (cells.every(c => !c)) continue;

    const raw: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => { raw[h] = cells[idx] ?? ''; });

    const get = (key: string) => (colMap[key] !== undefined ? (cells[colMap[key]] ?? '').trim() : '');

    const flags: string[] = [];
    const expenseType = get('expense_type');
    const category = detectCategory(expenseType) ?? 'air_travel';

    if (!detectCategory(expenseType)) flags.push('unknown_expense_type');

    const rawDate = get('date') || get('checkin');
    const parsedDate = parseDate(rawDate);
    if (rawDate && !parsedDate) flags.push('unparseable_date');

    const origin = get('origin').toUpperCase();
    const destination = get('destination').toUpperCase();

    let distanceKm: number | null = null;
    let rawQty: number | null = null;
    let normalizedQty: number | null = null;
    let normalizedUnit = '';
    let rawUnit = '';
    let co2e: number | null = null;
    let ef: number | null = null;

    if (category === 'air_travel') {
      const distStr = get('distance_km');
      if (distStr) {
        distanceKm = parseFloat(distStr.replace(',', ''));
        if (isNaN(distanceKm)) distanceKm = null;
      }
      if (!distanceKm && origin && destination) {
        const est = estimateFlightDistance(origin, destination);
        if (est) {
          distanceKm = est;
          flags.push('distance_estimated_from_airports');
        } else {
          flags.push('distance_estimated_missing_route');
        }
      }
      if (!distanceKm) flags.push('missing_distance');

      const cabin = parseCabin(get('cabin'));
      if (cabin === 'unknown' && get('cabin')) flags.push('unknown_cabin_class');

      rawQty = distanceKm;
      rawUnit = 'km';
      normalizedQty = distanceKm;
      normalizedUnit = 'passenger-km';

      if (distanceKm) {
        ef = flightFactor(distanceKm, cabin);
        co2e = +(distanceKm * ef).toFixed(3);
      }
    } else if (category === 'hotel_stay') {
      const nightsStr = get('nights');
      const nights = parseInt(nightsStr, 10);
      rawQty = isNaN(nights) ? null : nights;
      rawUnit = 'nights';
      normalizedQty = rawQty;
      normalizedUnit = 'room-nights';
      if (!rawQty) flags.push('missing_nights');
      ef = HOTEL_NIGHT_EF;
      co2e = rawQty ? +(rawQty * HOTEL_NIGHT_EF).toFixed(3) : null;
    } else {
      // ground transport
      const distStr = get('distance_km');
      distanceKm = distStr ? parseFloat(distStr.replace(',', '')) : null;
      if (distanceKm && isNaN(distanceKm)) distanceKm = null;
      rawQty = distanceKm;
      rawUnit = 'km';
      normalizedQty = distanceKm;
      normalizedUnit = 'km';
      if (!distanceKm) flags.push('missing_distance');
      ef = GROUND_TRANSPORT_EF;
      co2e = distanceKm ? +(distanceKm * GROUND_TRANSPORT_EF).toFixed(3) : null;
    }

    rows.push({
      scope: 3,
      category,
      period_start: parsedDate ?? undefined,
      period_end: parsedDate ?? undefined,
      traveler_id: get('traveler_id'),
      origin,
      destination,
      distance_km: distanceKm ?? undefined,
      transport_mode: get('mode') || expenseType,
      raw_quantity: rawQty,
      raw_unit: rawUnit,
      raw_date: rawDate,
      normalized_quantity: normalizedQty,
      normalized_unit: normalizedUnit,
      emission_factor_kgco2e: ef ?? undefined,
      co2e_kg: co2e ?? undefined,
      flags,
      raw_row: raw,
      source_row_index: i,
      source_row_hash: hashRow(raw),
    });
  }

  return { rows, errors };
}
