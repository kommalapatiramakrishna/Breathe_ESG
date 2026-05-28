import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import AuthPage from './components/AuthPage';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import IngestPage from './components/IngestPage';
import ReviewQueue from './components/ReviewQueue';
import AuditLog from './components/AuditLog';

type Page = 'dashboard' | 'ingest' | 'review' | 'audit';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState<Page>('dashboard');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <Layout page={page} onNavigate={setPage} userEmail={user.email ?? ''}>
      {page === 'dashboard' && <Dashboard />}
      {page === 'ingest' && <IngestPage userId={user.id} />}
      {page === 'review' && <ReviewQueue userId={user.id} />}
      {page === 'audit' && <AuditLog />}
    </Layout>
  );
}
