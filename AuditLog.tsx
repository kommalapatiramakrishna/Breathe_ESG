import { useEffect, useState } from 'react';
import { CheckCircle, Flag, XCircle, Plus, CreditCard as Edit, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AuditEntry } from '../lib/types';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const PAGE_SIZE = 30;

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  created: { icon: Plus, color: 'text-slate-400', label: 'Created' },
  approved: { icon: CheckCircle, color: 'text-emerald-400', label: 'Approved' },
  flagged: { icon: Flag, color: 'text-amber-400', label: 'Flagged' },
  rejected: { icon: XCircle, color: 'text-red-400', label: 'Rejected' },
  status_changed: { icon: Edit, color: 'text-sky-400', label: 'Status changed' },
  field_edited: { icon: Edit, color: 'text-sky-400', label: 'Field edited' },
};

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, count } = await supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .eq('tenant_id', TENANT_ID)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      setEntries((data ?? []) as AuditEntry[]);
      setTotal(count ?? 0);
      setLoading(false);
    }
    load();
  }, [page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-white text-2xl font-bold">Audit Log</h1>
        <p className="text-slate-400 text-sm mt-1">Append-only record of all analyst actions. {total} entries.</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-500 text-sm">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No audit entries yet. Review some records to generate entries.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {entries.map(entry => {
              const cfg = ACTION_CONFIG[entry.action] ?? ACTION_CONFIG['created'];
              const Icon = cfg.icon;
              const isOpen = expanded === entry.id;
              const hasPayload = entry.old_value || entry.new_value || entry.note;

              return (
                <div key={entry.id}>
                  <div
                    className={`flex items-start gap-4 px-5 py-4 ${hasPayload ? 'cursor-pointer hover:bg-slate-800/30' : ''} transition-colors`}
                    onClick={() => hasPayload ? setExpanded(isOpen ? null : entry.id) : undefined}
                  >
                    <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-800 ${cfg.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-slate-600 text-xs font-mono truncate">{entry.record_id}</span>
                      </div>
                      {entry.note && (
                        <p className="text-slate-400 text-xs mt-0.5 line-clamp-1">{entry.note}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-slate-500 text-xs">{new Date(entry.created_at).toLocaleString()}</div>
                      {entry.actor && (
                        <div className="text-slate-600 text-xs mt-0.5 font-mono truncate max-w-[120px]">{entry.actor.slice(0, 8)}…</div>
                      )}
                    </div>
                  </div>

                  {isOpen && hasPayload && (
                    <div className="px-5 pb-4 ml-11">
                      <div className="bg-slate-800/70 rounded-lg p-3 text-xs font-mono text-slate-400 space-y-1">
                        {entry.note && (
                          <div><span className="text-slate-500">note:</span> {entry.note}</div>
                        )}
                        {entry.new_value && Object.entries(entry.new_value).map(([k, v]) => (
                          <div key={k}><span className="text-emerald-500/70">{k}:</span> {String(v)}</div>
                        ))}
                        {entry.old_value && Object.entries(entry.old_value).map(([k, v]) => (
                          <div key={k}><span className="text-red-500/70">{k} (old):</span> {String(v)}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-slate-500 text-xs">Page {page + 1} of {totalPages} · {total} entries</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
