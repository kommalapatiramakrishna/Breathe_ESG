import type { Scope } from '../types';

// Emission factors (kg CO2e per liter) - DEFRA/BEIS 2023
export const FUEL_EMISSION_FACTORS: Record<string, number> = {
  diesel: 2.68,
  petrol: 2.31,
  gasoline: 2.31,
  lpg: 1.51,
  natural_gas: 2.02, // per liter LNG equivalent
  heating_oil: 2.52,
};

// SAP unit normalization: convert to liters (liquid fuels) or kg (solids)
export function normalizeSapUnit(qty: number, unit: string): { normalizedQty: number | null; normalizedUnit: string } {
  const u = unit.toUpperCase().trim();
  switch (u) {
    case 'L':
    case 'LTR':
    case 'LT':
      return { normalizedQty: qty, normalizedUnit: 'L' };
    case 'ML':
      return { normalizedQty: qty / 1000, normalizedUnit: 'L' };
    case 'GAL': // US gallon
      return { normalizedQty: +(qty * 3.785).toFixed(4), normalizedUnit: 'L' };
    case 'IGAL': // Imperial gallon
      return { normalizedQty: +(qty * 4.546).toFixed(4), normalizedUnit: 'L' };
    case 'M3':
    case 'CBM':
      return { normalizedQty: +(qty * 1000).toFixed(4), normalizedUnit: 'L' };
    case 'KG':
      return { normalizedQty: qty, normalizedUnit: 'kg' };
    case 'G':
    case 'GR':
      return { normalizedQty: +(qty / 1000).toFixed(4), normalizedUnit: 'kg' };
    case 'MT':
    case 'TON':
    case 'MTON':
      return { normalizedQty: +(qty * 1000).toFixed(4), normalizedUnit: 'kg' };
    case 'KWH':
      return { normalizedQty: qty, normalizedUnit: 'kWh' };
    case 'MWH':
      return { normalizedQty: +(qty * 1000).toFixed(4), normalizedUnit: 'kWh' };
    default:
      return { normalizedQty: qty, normalizedUnit: unit };
  }
}

export function detectFuelCategory(description: string, material: string): string {
  const text = `${description} ${material}`.toLowerCase();
  if (/diesel|gasoil|gas oil/.test(text)) return 'diesel';
  if (/petrol|gasoline|unleaded/.test(text)) return 'petrol';
  if (/\blpg\b|propane|butane/.test(text)) return 'lpg';
  if (/natural.?gas|lng|cng/.test(text)) return 'natural_gas';
  if (/heating.?oil|fuel.?oil|furnace/.test(text)) return 'heating_oil';
  return 'procurement';
}

// Parse various date formats into YYYY-MM-DD
export function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();

  // ISO / YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.slice(0, 10));
    return isNaN(d.getTime()) ? null : s.slice(0, 10);
  }
  // DD.MM.YYYY (German SAP format)
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('.');
    const d = new Date(`${yyyy}-${mm}-${dd}`);
    return isNaN(d.getTime()) ? null : `${yyyy}-${mm}-${dd}`;
  }
  // MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [mm, dd, yyyy] = s.split('/');
    const d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`);
    return isNaN(d.getTime()) ? null : `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('/');
    // Disambiguate: if first part > 12 it must be DD/MM
    if (parseInt(dd, 10) > 12) {
      const d = new Date(`${yyyy}-${mm}-${dd}`);
      return isNaN(d.getTime()) ? null : `${yyyy}-${mm}-${dd}`;
    }
    // Ambiguous — treat as MM/DD for US sources, DD/MM for EU
    const d = new Date(`${yyyy}-${dd}-${mm}`);
    return isNaN(d.getTime()) ? null : `${yyyy}-${dd}-${mm}`;
  }
  // Natural language fallback
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export function hashRow(row: Record<string, string>): string {
  const str = JSON.stringify(row, Object.keys(row).sort());
  // Simple djb2-style hash (no crypto needed for dedup hint)
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function scopeLabel(scope: Scope): string {
  return `Scope ${scope}`;
}

export function formatCo2e(kg: number | null): string {
  if (kg === null) return '—';
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} t`;
  return `${kg.toFixed(1)} kg`;
}
