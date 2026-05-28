import { useEffect, useState } from 'react';
import { TrendingUp, CheckCircle, AlertTriangle, XCircle, Clock, Database, Zap, Plane, Fuel } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { IngestionJob } from '../lib/types';
import { formatCo2e } from '../lib/parsers/utils';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

interface Stats {
  total: number;
  pending: number;
  approved: number;
  flagged: number;
  rejected: number;
  totalCo2eKg: number;
  scope1: number;
  scope2: number;
  scope3: number;
  bySap: number;
  byUtility: number;
  byTravel: number;
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-400 text-sm">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-white text-2xl font-bold">{value}</div>
      {sub && <div className="text-slate-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function StatusBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300 font-medium">{count} <span className="text-slate-500 font-normal">({pct.toFixed(0)}%)</span></span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [recordsRes, jobsRes] = await Promise.all([
        supabase.from('emission_records').select('status, scope, source_type, co2e_kg').eq('tenant_id', TENANT_ID),
        supabase.from('ingestion_jobs').select('*').eq('tenant_id', TENANT_ID).order('created_at', { ascending: false }).limit(5),
      ]);

      const records = recordsRes.data ?? [];
      const s: Stats = {
        total: records.length,
        pending: records.filter(r => r.status === 'pending').length,
        approved: records.filter(r => r.status === 'approved').length,
        flagged: records.filter(r => r.status === 'flagged').length,
        rejected: records.filter(r => r.status === 'rejected').length,
        totalCo2eKg: records.reduce((sum, r) => sum + (r.co2e_kg ?? 0), 0),
        scope1: records.filter(r => r.scope === 1).length,
        scope2: records.filter(r => r.scope === 2).length,
        scope3: records.filter(r => r.scope === 3).length,
        bySap: records.filter(r => r.source_type === 'sap').length,
        byUtility: records.filter(r => r.source_type === 'utility').length,
        byTravel: records.filter(r => r.source_type === 'travel').length,
      };
      setStats(s);
      setJobs((jobsRes.data ?? []) as IngestionJob[]);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 text-sm">Loading dashboard...</div>
      </div>
    );
  }

  const s = stats!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-white text-2xl font-bold">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Acme Manufacturing Co. — Emissions overview</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Records" value={s.total} icon={Database} color="bg-slate-700 text-slate-300" />
        <StatCard label="Total CO2e" value={formatCo2e(s.totalCo2eKg)} sub="approved + pending" icon={TrendingUp} color="bg-emerald-500/20 text-emerald-400" />
        <StatCard label="Awaiting Review" value={s.pending + s.flagged} sub={`${s.flagged} flagged`} icon={Clock} color="bg-amber-500/20 text-amber-400" />
        <StatCard label="Approved" value={s.approved} sub="ready for audit" icon={CheckCircle} color="bg-emerald-500/20 text-emerald-400" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Status breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold text-sm mb-4">Review Status</h2>
          <div className="space-y-3">
            <StatusBar label="Approved" count={s.approved} total={s.total} color="bg-emerald-500" />
            <StatusBar label="Pending" count={s.pending} total={s.total} color="bg-sky-500" />
            <StatusBar label="Flagged" count={s.flagged} total={s.total} color="bg-amber-500" />
            <StatusBar label="Rejected" count={s.rejected} total={s.total} color="bg-red-500" />
          </div>
        </div>

        {/* Scope breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold text-sm mb-4">By GHG Scope</h2>
          <div className="space-y-4">
            {[
              { label: 'Scope 1 — Direct combustion', count: s.scope1, color: 'bg-orange-500', icon: Fuel },
              { label: 'Scope 2 — Purchased electricity', count: s.scope2, color: 'bg-sky-500', icon: Zap },
              { label: 'Scope 3 — Value chain', count: s.scope3, color: 'bg-violet-400', icon: Plane },
            ].map(({ label, count, color, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}/20`}>
                  <Icon className={`w-4 h-4 text-${color.replace('bg-', '')}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-slate-400 text-xs truncate">{label}</div>
                  <div className="text-white font-semibold">{count} records</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Source breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-white font-semibold text-sm mb-4">By Data Source</h2>
          <div className="space-y-3">
            <StatusBar label="SAP (Fuel & Procurement)" count={s.bySap} total={s.total} color="bg-orange-500" />
            <StatusBar label="Utility (Electricity)" count={s.byUtility} total={s.total} color="bg-sky-500" />
            <StatusBar label="Travel (Flights/Hotels)" count={s.byTravel} total={s.total} color="bg-teal-500" />
          </div>
        </div>
      </div>

      {/* Recent ingestion jobs */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-white font-semibold text-sm">Recent Ingestion Jobs</h2>
        </div>
        {jobs.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500 text-sm">
            No ingestion jobs yet. Go to <span className="text-emerald-400">Ingest Data</span> to upload files.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs">
                <th className="px-5 py-3 text-left font-medium">File</th>
                <th className="px-4 py-3 text-left font-medium">Source</th>
                <th className="px-4 py-3 text-left font-medium">Rows</th>
                <th className="px-4 py-3 text-left font-medium">Errors</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-5 py-3 text-left font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id} className="border-t border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3 text-slate-300 font-medium truncate max-w-[160px]">{job.file_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      job.source_type === 'sap' ? 'bg-orange-500/20 text-orange-400' :
                      job.source_type === 'utility' ? 'bg-sky-500/20 text-sky-400' :
                      'bg-teal-500/20 text-teal-400'
                    }`}>{job.source_type.toUpperCase()}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{job.parsed_rows}</td>
                  <td className="px-4 py-3">
                    {job.failed_rows > 0
                      ? <span className="text-red-400">{job.failed_rows}</span>
                      : <span className="text-slate-500">0</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs ${
                      job.status === 'completed' ? 'text-emerald-400' :
                      job.status === 'failed' ? 'text-red-400' : 'text-amber-400'
                    }`}>
                      {job.status === 'completed' ? <CheckCircle className="w-3.5 h-3.5" /> :
                       job.status === 'failed' ? <XCircle className="w-3.5 h-3.5" /> :
                       <Clock className="w-3.5 h-3.5" />}
                      {job.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs">
                    {new Date(job.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
