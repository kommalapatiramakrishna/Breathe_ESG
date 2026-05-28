import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, Flag, XCircle, SlidersHorizontal, ChevronLeft, ChevronRight, AlertTriangle, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { EmissionRecord, RecordStatus } from '../lib/types';
import { formatCo2e, scopeLabel } from '../lib/parsers/utils';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const PAGE_SIZE = 25;

const STATUS_CONFIG: Record<RecordStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'text-sky-400', bg: 'bg-sky-500/15' },
  approved: { label: 'Approved', color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  flagged: { label: 'Flagged', color: 'text-amber-400', bg: 'bg-amber-500/15' },
  rejected: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-500/15' },
};

function StatusBadge({ status }: { status: RecordStatus }) {
  const c = STATUS_CONFIG[status];
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${c.color} ${c.bg}`}>
      {c.label}
    </span>
  );
}

interface RecordDetailProps {
  record: EmissionRecord;
  onClose: () => void;
  onStatusChange: (id: string, status: RecordStatus, notes: string) => void;
}

function RecordDetail({ record: r, onClose, onStatusChange }: RecordDetailProps) {
  const [notes, setNotes] = useState(r.analyst_notes || '');
  const [saving, setSaving] = useState(false);

  async function doAction(status: RecordStatus) {
    setSaving(true);
    await onStatusChange(r.id, status, notes);
    setSaving(false);
  }

  const fields: [string, string | number | null][] = [
    ['Source', r.source_type.toUpperCase()],
    ['Scope', scopeLabel(r.scope as 1 | 2 | 3)],
    ['Category', r.category],
    ['Period', r.period_start ? `${r.period_start} → ${r.period_end ?? r.period_start}` : '—'],
    ...(r.source_type === 'sap' ? [
      ['Plant', r.plant_code || '—'] as [string, string],
      ['Cost Center', r.cost_center || '—'] as [string, string],
      ['Material', r.material_number || '—'] as [string, string],
      ['Vendor', r.vendor || '—'] as [string, string],
    ] : []),
    ...(r.source_type === 'utility' ? [
      ['Meter ID', r.meter_id || '—'] as [string, string],
      ['Tariff', r.tariff_code || '—'] as [string, string],
    ] : []),
    ...(r.source_type === 'travel' ? [
      ['Origin', r.origin || '—'] as [string, string],
      ['Destination', r.destination || '—'] as [string, string],
      ['Distance (km)', r.distance_km?.toString() ?? '—'] as [string, string],
      ['Mode / Category', r.transport_mode || '—'] as [string, string],
      ['Traveler', r.traveler_id || '—'] as [string, string],
    ] : []),
    ['Raw Quantity', `${r.raw_quantity ?? '—'} ${r.raw_unit}`],
    ['Normalized', `${r.normalized_quantity ?? '—'} ${r.normalized_unit}`],
    ['Emission Factor', r.emission_factor_kgco2e != null ? `${r.emission_factor_kgco2e} kg CO2e/${r.normalized_unit}` : '—'],
    ['CO2e', formatCo2e(r.co2e_kg)],
    ['Row Index', r.source_row_index?.toString() ?? '—'],
    ['Row Hash', r.source_row_hash || '—'],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h3 className="text-white font-semibold text-sm">Record Detail</h3>
            <p className="text-slate-500 text-xs mt-0.5 font-mono">{r.id}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xs px-2 py-1 border border-slate-700 rounded transition-colors">
            Close
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {r.flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.flags.map(f => (
                <span key={f} className="flex items-center gap-1 text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded">
                  <AlertTriangle className="w-3 h-3" />{f}
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {fields.map(([label, val]) => (
              <div key={label}>
                <div className="text-slate-500 text-xs">{label}</div>
                <div className="text-slate-200 text-sm font-medium break-all">{val ?? '—'}</div>
              </div>
            ))}
          </div>

          {Object.keys(r.raw_row).length > 0 && (
            <div>
              <div className="text-slate-500 text-xs mb-1.5">Original row</div>
              <div className="bg-slate-800/70 rounded-lg p-3 text-xs font-mono text-slate-400 max-h-32 overflow-y-auto">
                {Object.entries(r.raw_row).map(([k, v]) => (
                  <div key={k}><span className="text-slate-500">{k}:</span> {v}</div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-slate-400 text-xs block mb-1.5">Analyst notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes for audit trail..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-slate-800">
          <button
            onClick={() => doAction('approved')}
            disabled={saving || r.status === 'approved'}
            className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white text-sm font-medium rounded-lg py-2.5 transition-colors"
          >
            <CheckCircle className="w-4 h-4" />Approve
          </button>
          <button
            onClick={() => doAction('flagged')}
            disabled={saving || r.status === 'flagged'}
            className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm font-medium rounded-lg py-2.5 border border-amber-500/30 transition-colors disabled:opacity-40"
          >
            <Flag className="w-4 h-4" />Flag
          </button>
          <button
            onClick={() => doAction('rejected')}
            disabled={saving || r.status === 'rejected'}
            className="flex-1 flex items-center justify-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium rounded-lg py-2.5 border border-red-500/30 transition-colors disabled:opacity-40"
          >
            <XCircle className="w-4 h-4" />Reject
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReviewQueue({ userId }: { userId: string }) {
  const [records, setRecords] = useState<EmissionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RecordStatus | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'sap' | 'utility' | 'travel'>('all');
  const [selected, setSelected] = useState<EmissionRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('emission_records')
      .select('*', { count: 'exact' })
      .eq('tenant_id', TENANT_ID)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (sourceFilter !== 'all') q = q.eq('source_type', sourceFilter);

    const { data, count, error } = await q;
    if (!error) {
      setRecords((data ?? []) as EmissionRecord[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [page, statusFilter, sourceFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(id: string, status: RecordStatus, notes: string) {
    await supabase
      .from('emission_records')
      .update({ status, analyst_notes: notes, reviewed_by: userId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);

    await supabase.from('audit_log').insert({
      record_id: id,
      tenant_id: TENANT_ID,
      action: status === 'approved' ? 'approved' : status === 'flagged' ? 'flagged' : 'rejected',
      actor: userId,
      new_value: { status, notes },
      note: notes,
    });

    setSelected(null);
    load();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl font-bold">Review Queue</h1>
          <p className="text-slate-400 text-sm mt-1">{total} records · approve, flag, or reject before audit lock</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
        <SlidersHorizontal className="w-4 h-4 text-slate-500" />
        <div className="flex gap-2 flex-wrap">
          {(['all', 'pending', 'flagged', 'approved', 'rejected'] as const).map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(0); }}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent hover:border-slate-700'
              }`}
            >
              {s === 'all' ? 'All statuses' : STATUS_CONFIG[s as RecordStatus].label}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-slate-700 hidden sm:block" />
        <div className="flex gap-2 flex-wrap">
          {(['all', 'sap', 'utility', 'travel'] as const).map(s => (
            <button
              key={s}
              onClick={() => { setSourceFilter(s); setPage(0); }}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                sourceFilter === s
                  ? 'bg-slate-600 text-slate-200'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {s === 'all' ? 'All sources' : s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-500 text-sm">Loading...</div>
        ) : records.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No records match these filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs border-b border-slate-800">
                  <th className="px-5 py-3 text-left font-medium">Source</th>
                  <th className="px-4 py-3 text-left font-medium">Scope / Category</th>
                  <th className="px-4 py-3 text-left font-medium">Period</th>
                  <th className="px-4 py-3 text-left font-medium">Quantity</th>
                  <th className="px-4 py-3 text-left font-medium">CO2e</th>
                  <th className="px-4 py-3 text-left font-medium">Flags</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-left font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-800/60 hover:bg-slate-800/30 transition-colors cursor-pointer"
                    onClick={() => setSelected(r)}
                  >
                    <td className="px-5 py-3">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                        r.source_type === 'sap' ? 'bg-orange-500/20 text-orange-400' :
                        r.source_type === 'utility' ? 'bg-sky-500/20 text-sky-400' :
                        'bg-teal-500/20 text-teal-400'
                      }`}>{r.source_type.toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-300 font-medium">{scopeLabel(r.scope as 1 | 2 | 3)}</div>
                      <div className="text-slate-500 text-xs">{r.category}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{r.period_start ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-300 tabular-nums">
                      {r.normalized_quantity != null ? `${r.normalized_quantity.toLocaleString()} ${r.normalized_unit}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-medium tabular-nums">{formatCo2e(r.co2e_kg)}</td>
                    <td className="px-4 py-3">
                      {r.flags.length > 0 ? (
                        <span className="flex items-center gap-1 text-xs text-amber-400">
                          <AlertTriangle className="w-3 h-3" />{r.flags.length}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status as RecordStatus} />
                    </td>
                    <td className="px-5 py-3">
                      <Eye className="w-4 h-4 text-slate-600 hover:text-emerald-400 transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-slate-500 text-xs">
            Page {page + 1} of {totalPages} · {total} records
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {selected && (
        <RecordDetail
          record={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
