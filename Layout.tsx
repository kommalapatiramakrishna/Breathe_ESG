import { Leaf, LayoutDashboard, Upload, ClipboardCheck, BookOpen, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { signOut } from '../lib/auth';

type Page = 'dashboard' | 'ingest' | 'review' | 'audit';

interface Props {
  page: Page;
  onNavigate: (p: Page) => void;
  children: React.ReactNode;
  userEmail: string;
}

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'ingest', label: 'Ingest Data', icon: Upload },
  { id: 'review', label: 'Review Queue', icon: ClipboardCheck },
  { id: 'audit', label: 'Audit Log', icon: BookOpen },
] as const;

export default function Layout({ page, onNavigate, children, userEmail }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-60 bg-slate-900 border-r border-slate-800 flex flex-col transform transition-transform duration-200
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
            <Leaf className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-none">Breathe ESG</div>
            <div className="text-slate-500 text-xs mt-0.5">Analyst Portal</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { onNavigate(id); setMobileOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${page === id
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-slate-800">
          <div className="px-3 py-2 mb-1">
            <div className="text-slate-300 text-xs font-medium truncate">{userEmail}</div>
            <div className="text-slate-500 text-xs">Acme Manufacturing Co.</div>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Leaf className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-white font-bold text-sm">Breathe ESG</span>
          </div>
          <button onClick={() => setMobileOpen(v => !v)} className="text-slate-400 hover:text-white">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
