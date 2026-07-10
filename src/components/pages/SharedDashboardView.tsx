import { useState, useEffect } from 'react';
import { BarChart2, Eye, AlertTriangle, Loader2, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ColumnStats } from '../../lib/types';
import SkipLink from '../ui/SkipLink';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';

const COLORS = ['#5B8DEF', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface Widget {
  id: string;
  type: string;
  title: string;
  column?: string;
  metric?: string;
  size?: string;
}

interface DashboardData {
  name: string;
  dataset_name: string;
  widgets: Widget[];
  updated_at: string;
}

interface CategoryBucket { name: string; count: number }
interface SeriesPoint { i: number; value: number }

interface SnapshotData {
  rowCount: number;
  categoryData: Record<string, { column: string; buckets: CategoryBucket[] }>;
  seriesData: Record<string, { column: string; points: SeriesPoint[] }>;
  previewIncluded: boolean;
  previewColumns: string[];
  previewRows: Record<string, unknown>[];
}

const EMPTY_SNAPSHOT: SnapshotData = {
  rowCount: 0,
  categoryData: {},
  seriesData: {},
  previewIncluded: false,
  previewColumns: [],
  previewRows: [],
};

function EmptyWidgetState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-[160px] text-xs text-paper-dimmer text-center px-4">
      {message}
    </div>
  );
}

function KPIWidget({ widget, snapshot, statistics, qualityScore }: { widget: Widget; snapshot: SnapshotData; statistics: Record<string, ColumnStats>; qualityScore: number }) {
  const columns = Object.keys(statistics);
  const numericCols = columns.filter(c => statistics[c]?.mean !== undefined);
  const col = widget.column ?? numericCols[0] ?? columns[0];
  const s = statistics[col];
  const metrics: Record<string, { label: string; value: string | number; color: string }> = {
    count: { label: 'Total Rows', value: snapshot.rowCount.toLocaleString(), color: 'text-accent-bright' },
    mean: { label: `Avg ${col}`, value: s?.mean?.toFixed(2) ?? 'N/A', color: 'text-emerald-400' },
    max: { label: `Max ${col}`, value: s?.max !== undefined ? String(s.max) : 'N/A', color: 'text-amber-400' },
    min: { label: `Min ${col}`, value: s?.min !== undefined ? String(s.min) : 'N/A', color: 'text-sky-400' },
    quality: { label: 'Quality Score', value: `${qualityScore}/100`, color: qualityScore >= 80 ? 'text-emerald-400' : qualityScore >= 60 ? 'text-amber-400' : 'text-red-400' },
    nulls: { label: 'Missing Values', value: Object.values(statistics).reduce((s, v) => s + (v?.nullCount ?? 0), 0), color: 'text-rose-400' },
  };
  const metric = metrics[widget.metric ?? 'count'];
  return (
    <div className="flex flex-col gap-1 h-full justify-center">
      <p className="text-xs text-paper-dim">{metric.label}</p>
      <p className={`text-2xl font-bold ${metric.color}`}>{metric.value}</p>
    </div>
  );
}

function BarWidget({ widget, snapshot }: { widget: Widget; snapshot: SnapshotData }) {
  const entry = snapshot.categoryData[widget.id];
  if (!entry || entry.buckets.length === 0) return <EmptyWidgetState message="No chart data available for this widget." />;
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={entry.buckets} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />
        <XAxis dataKey="name" tick={{ fill: '#6B6D73', fontSize: 9 }} />
        <YAxis tick={{ fill: '#6B6D73', fontSize: 9 }} />
        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #2A2E3A', borderRadius: 6, fontSize: 11 }} />
        <Bar dataKey="count" fill="#5B8DEF" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineWidget({ widget, snapshot }: { widget: Widget; snapshot: SnapshotData }) {
  const entry = snapshot.seriesData[widget.id];
  if (!entry || entry.points.length === 0) return <EmptyWidgetState message="No chart data available for this widget." />;
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={entry.points} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2A2E3A" />
        <XAxis dataKey="i" tick={{ fill: '#6B6D73', fontSize: 9 }} />
        <YAxis tick={{ fill: '#6B6D73', fontSize: 9 }} />
        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #2A2E3A', borderRadius: 6, fontSize: 11 }} />
        <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function PieWidget({ widget, snapshot }: { widget: Widget; snapshot: SnapshotData }) {
  const entry = snapshot.categoryData[widget.id];
  if (!entry || entry.buckets.length === 0) return <EmptyWidgetState message="No chart data available for this widget." />;
  const data = entry.buckets.slice(0, 6).map(b => ({ name: b.name, value: b.count }));
  return (
    <ResponsiveContainer width="100%" height={160}>
      <PieChart>
        <Pie data={data} dataKey="value" cx="50%" cy="50%" outerRadius={60} label={({ name }) => (name ?? '').slice(0, 8)}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #2A2E3A', borderRadius: 6, fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function TableWidget({ snapshot }: { widget: Widget; snapshot: SnapshotData }) {
  if (!snapshot.previewIncluded || snapshot.previewRows.length === 0) {
    return <EmptyWidgetState message="The dashboard owner did not include a dataset preview for this shared link." />;
  }
  const cols = snapshot.previewColumns.slice(0, 4);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr>{cols.map(c => <th key={c} className="text-left pb-1 pr-2 text-paper-dim font-medium">{c}</th>)}</tr></thead>
        <tbody>
          {snapshot.previewRows.slice(0, 5).map((row, i) => (
            <tr key={i} className="border-t border-ink-border">
              {cols.map(c => <td key={c} className="py-1 pr-2 text-paper/90 truncate max-w-[80px]">{String(row[c] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Simple SHA-256 hash using Web Crypto API */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

type ViewState = 'loading' | 'password' | 'ready' | 'error';

export default function SharedDashboardView({ shareToken }: { shareToken: string }) {
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotData>(EMPTY_SNAPSHOT);
  const [statistics, setStatistics] = useState<Record<string, ColumnStats>>({});
  const [qualityScore, setQualityScore] = useState(0);
  const [error, setError] = useState('');

  // Password flow
  const [shareRecord, setShareRecord] = useState<{
    id: string;
    dashboard_id: string;
    share_password_hash?: string | null;
    expires_at?: string | null;
  } | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordChecking, setPasswordChecking] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Use the public anon key — RLS must allow anonymous reads on shared_dashboards
        const { data: share, error: shareErr } = await supabase
          .from('shared_dashboards')
          .select('id, dashboard_id, is_public, revoked, expires_at, share_password_hash')
          .eq('share_token', shareToken)
          .maybeSingle();

        if (shareErr || !share) {
          setError('This dashboard link is invalid or has been revoked.');
          setViewState('error');
          return;
        }

        if (share.revoked) {
          setError('This dashboard link has been revoked.');
          setViewState('error');
          return;
        }

        if (!share.is_public) {
          setError('This dashboard is not publicly shared.');
          setViewState('error');
          return;
        }

        // Check expiry
        if (share.expires_at) {
          const expiresAt = new Date(share.expires_at);
          if (expiresAt < new Date()) {
            setError('This share link has expired.');
            setViewState('error');
            return;
          }
        }

        setShareRecord(share);

        // If password protected, show password prompt
        if (share.share_password_hash) {
          setViewState('password');
          return;
        }

        // No password — load dashboard directly
        await loadDashboard(share.dashboard_id, share.id);
      } catch {
        setError('Failed to load shared dashboard.');
        setViewState('error');
      }
    }
    load();
  }, [shareToken]);

  async function loadDashboard(dashboardId: string, sharedDashboardId: string) {
    const { data: db } = await supabase
      .from('dashboards')
      .select('name, dataset_name, widgets, updated_at')
      .eq('id', dashboardId)
      .maybeSingle();

    if (!db) {
      setError('Dashboard not found.');
      setViewState('error');
      return;
    }

    setDashboard(db as DashboardData);

    // Load the aggregated snapshot (anon-accessible via RLS) — provides the
    // chart/table data AND the KPI statistics/quality score the owner
    // published with this share link, all captured atomically at share time.
    //
    // Root-cause note: this used to source statistics/qualityScore from a
    // *separate* analysis_sessions row looked up independently by dataset
    // name. That row only exists if the owner had, at some point, explicitly
    // saved a session to the cloud — sharing a dashboard never guaranteed
    // one existed. A dashboard shared straight after upload (the common case)
    // had a perfectly good snapshot but no matching analysis_sessions row, so
    // every KPI reading `statistics`/`qualityScore` rendered "N/A". Reading
    // both from the snapshot removes that dependency entirely.
    const { data: snap } = await supabase
      .from('dashboard_snapshots')
      .select('row_count, category_data, series_data, preview_included, preview_columns, preview_rows, statistics, quality_score')
      .eq('shared_dashboard_id', sharedDashboardId)
      .maybeSingle();

    if (snap) {
      setSnapshot({
        rowCount: snap.row_count ?? 0,
        categoryData: (snap.category_data as SnapshotData['categoryData']) ?? {},
        seriesData: (snap.series_data as SnapshotData['seriesData']) ?? {},
        previewIncluded: snap.preview_included ?? false,
        previewColumns: (snap.preview_columns as string[]) ?? [],
        previewRows: (snap.preview_rows as Record<string, unknown>[]) ?? [],
      });
      setStatistics((snap.statistics as Record<string, ColumnStats>) ?? {});
      setQualityScore(snap.quality_score ?? 0);
    } else {
      // Legacy fallback for share links created before statistics were
      // embedded in the snapshot: fall back to the old analysis_sessions
      // lookup so pre-existing shares don't regress to "N/A" everywhere.
      const { data: session } = await supabase
        .from('analysis_sessions')
        .select('statistics, quality_score')
        .eq('dataset_name', db.dataset_name)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (session) {
        setStatistics((session.statistics as Record<string, ColumnStats>) ?? {});
        setQualityScore(session.quality_score ?? 0);
      }
    }

    setViewState('ready');
  }

  async function handlePasswordSubmit() {
    if (!shareRecord?.share_password_hash || !passwordInput.trim()) return;
    setPasswordChecking(true);
    setPasswordError('');

    try {
      const inputHash = await sha256(passwordInput.trim());
      if (inputHash !== shareRecord.share_password_hash) {
        setPasswordError('Incorrect password. Please try again.');
        setPasswordChecking(false);
        return;
      }
      // Password correct — load dashboard
      await loadDashboard(shareRecord.dashboard_id, shareRecord.id);
    } catch {
      setPasswordError('Password verification failed. Please try again.');
      setPasswordChecking(false);
    }
  }

  function renderWidget(widget: Widget) {
    const props = { widget, snapshot, statistics, qualityScore };
    switch (widget.type) {
      case 'kpi': return <KPIWidget {...props} />;
      case 'bar_chart': return <BarWidget {...props} />;
      case 'line_chart': return <LineWidget {...props} />;
      case 'pie_chart': return <PieWidget {...props} />;
      case 'table': return <TableWidget {...props} />;
      default: return null;
    }
  }

  if (viewState === 'loading') {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent-bright animate-spin" />
      </div>
    );
  }

  if (viewState === 'error') {
    return (
      <div className="min-h-screen bg-ink flex flex-col items-center justify-center text-center px-4">
        <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-paper mb-2">Dashboard Unavailable</h2>
        <p className="text-paper-dim max-w-sm">{error}</p>
      </div>
    );
  }

  if (viewState === 'password') {
    return (
      <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-ink-raised rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-7 h-7 text-accent-bright" />
            </div>
            <h2 className="text-xl font-bold text-paper">Password Protected</h2>
            <p className="text-paper-dim text-sm mt-1">Enter the password to view this dashboard.</p>
          </div>
          <div className="bg-ink-surface border border-ink-border rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-paper-dim mb-1.5">Password</label>
              <input
                type="password"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handlePasswordSubmit(); }}
                placeholder="Enter password…"
                autoFocus
                className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer"
                disabled={passwordChecking}
              />
            </div>
            {passwordError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{passwordError}
              </p>
            )}
            <button
              onClick={handlePasswordSubmit}
              disabled={passwordChecking || !passwordInput.trim()}
              className="w-full py-2.5 bg-accent hover:bg-accent-bright disabled:opacity-50 text-ink text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
            >
              {passwordChecking ? <><Loader2 className="w-4 h-4 animate-spin" />Verifying…</> : 'View Dashboard'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink">
      <SkipLink />
      <header className="border-b border-ink-border bg-ink-surface/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <BarChart2 className="w-5 h-5 text-accent-bright" />
            <span className="font-semibold text-paper text-sm tracking-tight">VKAnalyze</span>
          </a>
          <div className="flex items-center gap-2 text-xs text-paper-dim">
            <Eye className="w-3.5 h-3.5" />
            Shared dashboard — read only
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-paper tracking-tight">{dashboard?.name}</h1>
          <p className="text-sm text-paper-dim mt-1">
            Dataset: {dashboard?.dataset_name} &middot; Last updated {dashboard?.updated_at ? new Date(dashboard.updated_at).toLocaleDateString() : 'Unknown'}
          </p>
        </div>

        {dashboard && dashboard.widgets.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboard.widgets.map(widget => (
              <div key={widget.id} className="bg-ink-surface border border-ink-border rounded-xl p-4 hover:border-ink-borderStrong transition-colors">
                <div className="mb-3">
                  <span className="text-xs font-medium text-paper/90">{widget.title}</span>
                </div>
                {renderWidget(widget)}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-paper-dim">
            <BarChart2 className="w-10 h-10 mb-3 opacity-30" />
            <p>This dashboard has no widgets yet.</p>
          </div>
        )}

        <div className="mt-12 text-center">
          <a href="/" className="text-xs text-paper-dimmer hover:text-paper-dim transition-colors">
            Built with VKAnalyze — analyze your own data
          </a>
        </div>
      </main>
    </div>
  );
}
